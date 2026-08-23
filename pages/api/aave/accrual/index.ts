import { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { formatUnits } from "ethers/lib/utils";

import { AaveMarketDataType, markets } from "../../../../hooks/useAaveData";
import {
  AccrualSide,
  LedgerAction,
  TokenFlowEvent,
  buildLedger,
  clampRoundingDust,
  findFirstPrincipalEvent,
  getAccruedInterest,
  getPendingInterest,
  getRealizedInterest,
} from "../../../../utils/tokenEventAccrual";
import {
  SpokeFlowEvent,
  buildLedgerV4,
  decodeV4PositionRef,
  findFirstPrincipalEventV4,
  getAccruedInterestV4,
  getRealizedInterestV4,
} from "../../../../utils/spokeEventAccrual";

const TOKEN_ABI = [
  "event Mint(address indexed caller, address indexed onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Burn(address indexed from, address indexed target, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/** The v4 Spoke events and views the accrual scan needs (see ISpoke). */
const SPOKE_ACCRUAL_ABI = [
  "event Supply(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 suppliedShares, uint256 suppliedAmount)",
  "event Withdraw(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 withdrawnShares, uint256 withdrawnAmount)",
  "event Borrow(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 drawnAmount)",
  "event Repay(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 totalAmountRepaid, (int256 sharesDelta, int256 offsetRayDelta, uint256 restoredPremiumRay) premiumDelta)",
  "event LiquidationCall(uint256 indexed collateralReserveId, uint256 indexed debtReserveId, address indexed user, address liquidator, bool receiveShares, uint256 debtAmountRestored, uint256 drawnSharesLiquidated, (int256 sharesDelta, int256 offsetRayDelta, uint256 restoredPremiumRay) premiumDelta, uint256 collateralAmountRemoved, uint256 collateralSharesLiquidated, uint256 collateralSharesToLiquidator)",
  "function getReserve(uint256 reserveId) view returns (tuple(address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 reserveId, address user) view returns (uint256)",
];

export type { AccrualSide };

/** Alchemy (and similar providers) reject eth_getLogs responses above ~10k logs */
const LOG_CAP_ERROR =
  /response size exceeded|more than 10000 results|10K logs|query returned more than/i;

/** Alchemy serves any number of logs when the queried range is at most 10k
 * blocks, so bisection never needs to descend below this window: a cap error
 * on a smaller range cannot be fixed by splitting further. */
const SAFE_RANGE = 10_000;

/** A topic slot: absent (wildcard), one value, or any-of a set. */
type TopicFilter = string | null | string[];

type LogFilter = {
  /** one contract, or any-of a set (only sources with `multiAddress`) */
  address: string | string[];
  topics: TopicFilter[];
};

type LogSource = {
  getLogs(
    filter: LogFilter & { fromBlock: number; toBlock: number },
  ): Promise<ethers.providers.Log[]>;
  /** whether `address` may be a set; explorer APIs take one contract only */
  multiAddress?: boolean;
};

/**
 * getLogs that survives the provider's response-size cap: on a cap error the
 * block range is bisected and both halves fetched, recursively, stopping at
 * `SAFE_RANGE` windows the provider guarantees to serve. Halves are fetched
 * sequentially — hyperactive addresses (bots with 10k+ events on one token)
 * produce deep trees, and a parallel burst trips the provider's request
 * throttling, which ethers retries with silent multi-minute backoffs.
 * The budget guards against unbounded recursion; other errors are rethrown.
 */
/** Whether an error is the provider refusing an oversized log response. */
const isLogCapError = (err: any): boolean =>
  LOG_CAP_ERROR.test(
    `${err?.message ?? ""} ${err?.error?.message ?? ""} ${err?.body ?? ""}`,
  );

export const getLogsChunked = async (
  provider: LogSource,
  filter: LogFilter,
  fromBlock: number,
  toBlock: number,
  budget: { calls: number } = { calls: 150 },
): Promise<ethers.providers.Log[]> => {
  budget.calls -= 1;
  try {
    return await provider.getLogs({ ...filter, fromBlock, toBlock });
  } catch (err: any) {
    if (
      !isLogCapError(err) ||
      budget.calls <= 0 ||
      toBlock - fromBlock < SAFE_RANGE
    )
      throw err;
    const mid = fromBlock + Math.floor((toBlock - fromBlock) / 2);
    const lower = await getLogsChunked(
      provider,
      filter,
      fromBlock,
      mid,
      budget,
    );
    const upper = await getLogsChunked(
      provider,
      filter,
      mid + 1,
      toBlock,
      budget,
    );
    return [...lower, ...upper];
  }
};

/**
 * LogSource over plain eth_getLogs. ethers' own getLogs takes a single address
 * and coerces topics through its Filter type, so the set forms — which let one
 * request cover every reserve in a market — have to go out as a raw send.
 */
export const rpcLogSource = (
  provider: ethers.providers.StaticJsonRpcProvider,
): LogSource => ({
  multiAddress: true,
  async getLogs({ address, topics, fromBlock, toBlock }) {
    const logs: any[] = await provider.send("eth_getLogs", [
      {
        address,
        topics,
        fromBlock: ethers.utils.hexValue(fromBlock),
        toBlock: ethers.utils.hexValue(toBlock),
      },
    ]);
    // Raw JSON-RPC reports quantities as hex; the rest of the scan expects the
    // numeric shape ethers' own getLogs returns.
    return logs.map((log) => ({
      ...log,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
      transactionIndex: Number(log.transactionIndex),
      removed: false,
    })) as ethers.providers.Log[];
  },
});

/** Explorer APIs report numbers as hex ("0x1a"), bare "0x" for zero, or
 * occasionally decimal strings, depending on the implementation. */
const explorerNumber = (value: string | number): number => {
  if (typeof value === "number") return value;
  if (value === "0x") return 0;
  return value.startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10);
};

/**
 * LogSource backed by an Etherscan-compatible explorer API (Blockscout,
 * Routescan, Etherscan). Markets set `logApi` when their RPC caps eth_getLogs
 * to a block range too small to scan the market's history (Alchemy allows
 * only 10k-block windows on Plasma and MegaETH — thousands of calls to cover
 * the market), while their explorers serve the same filter over any range.
 *
 * Explorers silently clip results to a page limit that varies by
 * implementation (Routescan defaults to 100, honors offset up to 1000;
 * Blockscout ignores paging params entirely), and a clipped result is
 * indistinguishable from a complete one. So no page size is ever assumed:
 * each query resumes from the last block seen — re-fetching that block in
 * full so logs cut off mid-block are not lost, deduped by (txHash, logIndex)
 * — until a query contributes nothing new.
 */
export const explorerLogSource = (apiUrl: string): LogSource => ({
  async getLogs(filter) {
    // Routescan matches topic/address params case-sensitively, so normalize
    // everything to lowercase. Set-valued address/topic filters never reach
    // here: queryLogs expands them before calling a single-address source.
    const topics = (filter.topics ?? []).map((topic) =>
      Array.isArray(topic) ? (topic[0] ?? null) : topic,
    );
    const params = new URLSearchParams({
      module: "logs",
      action: "getLogs",
      toBlock: String(filter.toBlock),
      address: String(filter.address).toLowerCase(),
      // Request the largest page Etherscan-compatible APIs allow; explorers
      // that ignore paging params fall back to their own limit, which the
      // resume loop below absorbs either way.
      page: "1",
      offset: "1000",
    });
    const present = topics
      .map((topic, index) => (topic ? index : -1))
      .filter((index) => index >= 0);
    present.forEach((index) =>
      params.set(`topic${index}`, topics[index]!.toLowerCase()),
    );
    // Etherscan-compatible APIs require an operator for every pair of
    // provided topics, not just adjacent ones (a v4 scan filters on three:
    // event, reserveId and user).
    present.forEach((a, i) =>
      present.slice(i + 1).forEach((b) => {
        params.set(`topic${a}_${b}_opr`, "and");
      }),
    );

    const logs: ethers.providers.Log[] = [];
    const seen = new Set<string>();
    let fromBlock = Number(filter.fromBlock ?? 0);
    for (;;) {
      params.set("fromBlock", String(fromBlock));
      const res = await fetch(`${apiUrl}?${params}`);
      if (!res.ok) {
        throw new Error(`Explorer log query failed: HTTP ${res.status}`);
      }
      const body = await res.json();
      if (!Array.isArray(body?.result)) {
        // "No records found" is a normal empty result on some explorers.
        if (/no records/i.test(`${body?.message} ${body?.result}`)) break;
        throw new Error(
          `Explorer log query failed: ${body?.result ?? body?.message}`,
        );
      }
      if (body.result.length === 0) break;

      let added = 0;
      body.result.forEach((raw: any) => {
        const logIndex = explorerNumber(raw.logIndex ?? 0);
        const key = `${raw.transactionHash}-${logIndex}`;
        if (seen.has(key)) return;
        seen.add(key);
        added += 1;
        logs.push({
          blockNumber: explorerNumber(raw.blockNumber),
          blockHash: raw.blockHash ?? "",
          transactionIndex: explorerNumber(raw.transactionIndex ?? 0),
          removed: false,
          address: raw.address,
          data: raw.data,
          // Some explorers (Blockscout) pad topics to four entries with
          // nulls, which ethers' parseLog cannot digest.
          topics: (raw.topics ?? []).filter(
            (topic: unknown): topic is string => typeof topic === "string",
          ),
          transactionHash: raw.transactionHash,
          logIndex,
        });
      });
      if (added === 0) break;

      const lastBlock = explorerNumber(
        body.result[body.result.length - 1].blockNumber,
      );
      fromBlock = Math.max(lastBlock, fromBlock);
    }
    return logs;
  },
});

/** One classified, dated event of the position's interest accounting */
/** Collapse a one-element set to the scalar form, so a single-position scan
 *  emits exactly the filter a per-position scan always has. */
const collapse = (values: string[]): string | string[] =>
  values.length === 1 ? values[0] : values;

/**
 * Run a log query that may span many contracts (and, for v4, many reserve ids)
 * in one request. This is the whole point of the batched scan: one
 * eth_getLogs filtered on the indexed user topic covers every reserve in a
 * market, instead of one request per reserve per event type.
 *
 * Explorer-backed sources accept a single contract and no topic sets, so for
 * those the query is expanded back into the individual combinations. Those are
 * the only markets whose logs don't come from the paid RPC provider, so
 * nothing is lost by fanning out there.
 */
const queryLogs = async (
  source: LogSource,
  addresses: string[],
  topics: TopicFilter[],
  fromBlock: number,
  toBlock: number,
): Promise<ethers.providers.Log[]> => {
  if (addresses.length === 0) return [];
  if (source.multiAddress) {
    // Covering many contracts at once multiplies the logs one request can
    // return, so a window that a single contract fits inside the provider's
    // cap may not fit for the whole set. Block-range bisection bottoms out at
    // SAFE_RANGE, so when that is not enough, split the contract set instead.
    // This halves down to single-contract queries in the worst case — the
    // per-contract behaviour this replaced — while staying at one request in
    // the common one.
    const run = async (subset: string[]): Promise<ethers.providers.Log[]> => {
      try {
        return await getLogsChunked(
          source,
          { address: collapse(subset), topics },
          fromBlock,
          toBlock,
        );
      } catch (err: any) {
        if (subset.length === 1 || !isLogCapError(err)) throw err;
        const mid = Math.ceil(subset.length / 2);
        // Sequential, for the same throttling reason as range bisection.
        const lower = await run(subset.slice(0, mid));
        const upper = await run(subset.slice(mid));
        return [...lower, ...upper];
      }
    };
    return run(addresses);
  }

  // Expand every set-valued topic slot into concrete combinations.
  let combinations: (string | null)[][] = [[]];
  topics.forEach((topic) => {
    const options = Array.isArray(topic) ? topic : [topic];
    combinations = combinations.flatMap((prefix) =>
      options.map((option) => [...prefix, option]),
    );
  });

  const logs: ethers.providers.Log[] = [];
  // Sequential: explorer APIs rate-limit aggressively, and a burst here would
  // be retried with long backoffs.
  for (const address of addresses) {
    for (const combination of combinations) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await getLogsChunked(
        source,
        { address, topics: combination },
        fromBlock,
        toBlock,
      );
      logs.push(...batch);
    }
  }
  return logs;
};

export type LedgerRow = {
  action: LedgerAction;
  /** signed principal change in human-readable token units */
  principalDelta: string;
  /** interest credited to the balance at this event, human-readable units */
  interestRealized: string;
  /** unix seconds of the event's block */
  timestamp: number | null;
  txHash: string | null;
  blockNumber: number;
};

export type AccrualResponse = {
  /** accrued interest in human-readable token units */
  accruedValue: string;
  /** accrued interest in base units */
  accruedRaw: string;
  /** unix seconds of the first principal-adding event, if any */
  sinceTimestamp: number | null;
  /** number of balance-changing events found for this user/token */
  eventCount: number;
  /** chronological event ledger; present when includeLedger was requested */
  ledger?: LedgerRow[];
  /** interest credited to the balance at past events, human-readable units */
  realizedValue?: string;
  /** interest accrued since the last event, human-readable units */
  pendingValue?: string;
};

/** Timestamps cost one getBlock call per unique block. Hyperactive addresses
 * (bots) touch tens of thousands of blocks, which would dwarf the log scan
 * itself and trip provider throttling, so only the earliest blocks get dated
 * — the ledger shows "—" for the rest and the interest math is unaffected. */
const MAX_TIMESTAMP_LOOKUPS = 2_000;

/** A mined block's timestamp never changes, so these are cached for the life of
 *  the page. Without this, a scan covering every reserve re-dates the same
 *  block once per position that happens to include it. */
const blockTimestampCache = new Map<string, number>();

/** Token decimals are immutable too, and the same token is queried on every
 *  visit to a market. */
const decimalsCache = new Map<string, number>();

const cacheKey = (chainId: number, value: string | number) =>
  `${chainId}:${String(value).toLowerCase()}`;

/** Clears the immutable-data caches. Only needed by tests, which assert on the
 *  requests a scan makes and would otherwise see earlier tests' cache hits. */
export const resetAccrualCaches = () => {
  blockTimestampCache.clear();
  decimalsCache.clear();
  v4DecimalsCache.clear();
};

/**
 * Resolve block timestamps for the given block numbers with a bounded number
 * of concurrent RPC requests. Blocks already dated by an earlier position (or
 * an earlier scan) cost nothing.
 */
const resolveBlockTimestamps = async (
  provider: ethers.providers.StaticJsonRpcProvider,
  chainId: number,
  blockNumbers: number[],
  concurrency: number = 8,
): Promise<Map<number, number>> => {
  const timestamps = new Map<number, number>();
  const missing: number[] = [];
  [...new Set(blockNumbers)]
    .sort((a, b) => a - b)
    .forEach((blockNumber) => {
      const cached = blockTimestampCache.get(cacheKey(chainId, blockNumber));
      if (cached === undefined) missing.push(blockNumber);
      else timestamps.set(blockNumber, cached);
    });

  const toFetch = missing.slice(0, MAX_TIMESTAMP_LOOKUPS);
  let next = 0;
  const worker = async () => {
    while (next < toFetch.length) {
      const blockNumber = toFetch[next];
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      const block = await provider.getBlock(blockNumber);
      timestamps.set(blockNumber, block.timestamp);
      blockTimestampCache.set(cacheKey(chainId, blockNumber), block.timestamp);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, toFetch.length) }, worker),
  );
  return timestamps;
};

/** decimals() for many tokens at once, skipping any already known. */
const resolveDecimals = async (
  provider: ethers.providers.StaticJsonRpcProvider,
  chainId: number,
  addresses: string[],
): Promise<Map<string, number>> => {
  const resolved = new Map<string, number>();
  const missing: string[] = [];
  [...new Set(addresses.map((address) => address.toLowerCase()))].forEach(
    (address) => {
      const cached = decimalsCache.get(cacheKey(chainId, address));
      if (cached === undefined) missing.push(address);
      else resolved.set(address, cached);
    },
  );

  await Promise.all(
    missing.map(async (address) => {
      const token = new ethers.Contract(address, TOKEN_ABI, provider);
      const decimals: number = await token.decimals();
      decimalsCache.set(cacheKey(chainId, address), decimals);
      resolved.set(address, decimals);
    }),
  );
  return resolved;
};

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      res.status(405).send({ message: "Method not allowed." });
      return;
    }
    const body =
      typeof _req.body === "string" ? JSON.parse(_req.body) : _req.body;
    const { marketId, user, tokenAddress, side, includeLedger } = body as {
      marketId: string;
      user: string;
      tokenAddress: string;
      side: AccrualSide;
      includeLedger?: boolean;
    };

    const market = markets.find((m: AaveMarketDataType) => m.id === marketId);

    if (
      !(market?.v3 || market?.v4) ||
      !ethers.utils.isAddress(user ?? "") ||
      !ethers.utils.isAddress(tokenAddress ?? "") ||
      (side !== "supply" && side !== "borrow")
    ) {
      res.status(400).json({ message: "Invalid accrual request." });
      return;
    }

    const data: AccrualResponse = await getAccrualData(
      market,
      user,
      tokenAddress,
      side,
      !!includeLedger,
    );
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/** Bound on a scan. A stalled RPC (providers throttle bursts and ethers
 * retries with silent, exponentially growing backoffs) would otherwise leave
 * callers pending forever. A whole-market scan shares one budget, so it gets a
 * small allowance per position on top of the base. */
const SCAN_TIMEOUT_MS = 180_000;
const SCAN_TIMEOUT_PER_POSITION_MS = 1_000;
const SCAN_TIMEOUT_MAX_MS = 600_000;

const withScanTimeout = <T>(
  work: Promise<T>,
  positionCount: number = 1,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Interest scan timed out. This address may have too much on-chain history.",
          ),
        ),
      Math.min(
        SCAN_TIMEOUT_MS + positionCount * SCAN_TIMEOUT_PER_POSITION_MS,
        SCAN_TIMEOUT_MAX_MS,
      ),
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/** One position to scan: a v3 aToken/variableDebtToken, or the synthetic
 *  position ref that carries a v4 reserveId. */
export type ScanPosition = {
  symbol?: string;
  tokenAddress: string;
  side: AccrualSide;
};

export type ScanResult = ScanPosition & {
  data?: AccrualResponse;
  error?: string;
};

/** A position the user never held: no events means no balance, because an
 *  aToken or debt token balance can only arise from a Mint or an incoming
 *  Transfer, both of which the scan queries. Consumers read these through
 *  Number(), so the unscaled "0" is equivalent to a formatted zero. */
const emptyResult = (includeLedger: boolean): AccrualResponse => ({
  accruedValue: "0",
  accruedRaw: "0",
  sinceTimestamp: null,
  eventCount: 0,
  ...(includeLedger
    ? { ledger: [], realizedValue: "0", pendingValue: "0" }
    : {}),
});

/** Run `work` over `items` with at most `concurrency` in flight. Providers
 *  throttle bursts, and ethers retries those with silent long backoffs. */
const mapPooled = async <T, R>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
};

export const getAccrualData = async (
  market: AaveMarketDataType,
  user: string,
  tokenAddress: string,
  side: AccrualSide,
  includeLedger: boolean = false,
): Promise<AccrualResponse> => {
  const [result] = await scanPositions(
    market,
    user,
    [{ tokenAddress, side }],
    includeLedger,
  );
  if (result.error) throw new Error(result.error);
  return result.data!;
};

/**
 * Scan any number of positions for one user in one market.
 *
 * The RPC cost of this is roughly flat in the number of positions: the event
 * history for every position arrives in a handful of requests, because
 * eth_getLogs accepts a set of contracts (v3) or a set of reserve ids in an
 * indexed topic (v4), and the user address is indexed on every event. Only
 * positions that actually show events cost anything beyond that.
 */
export const scanPositions = (
  market: AaveMarketDataType,
  user: string,
  positions: ScanPosition[],
  includeLedger: boolean = false,
): Promise<ScanResult[]> =>
  withScanTimeout(
    market.v4
      ? scanPositionsV4(market, user, positions, includeLedger)
      : scanPositionsV3(market, user, positions, includeLedger),
    positions.length,
  );

const scanPositionsV3 = async (
  market: AaveMarketDataType,
  user: string,
  positions: ScanPosition[],
  includeLedger: boolean,
): Promise<ScanResult[]> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId,
  );
  const iface = new ethers.utils.Interface(TOKEN_ABI);
  const userTopic = ethers.utils.hexZeroPad(user, 32);
  const latestBlock = await provider.getBlockNumber();
  const firstBlock = market.startBlock ?? 0;
  const logSource: LogSource = market.logApi
    ? explorerLogSource(market.logApi)
    : rpcLogSource(provider);

  const allTokens = positions.map((position) => position.tokenAddress);
  const supplyTokens = positions
    .filter((position) => position.side === "supply")
    .map((position) => position.tokenAddress);

  const scan = (addresses: string[], topics: TopicFilter[]) =>
    queryLogs(logSource, addresses, topics, firstBlock, latestBlock);

  // One request per event shape covers every position: the indexed user topic
  // does the filtering, and log.address says which position each log belongs
  // to. Debt tokens are non-transferable, so the Transfer queries span the
  // supply-side contracts only.
  const [mintLogs, burnLogs, transferInLogs, transferOutLogs] =
    await Promise.all([
      scan(allTokens, [iface.getEventTopic("Mint"), null, userTopic]),
      scan(allTokens, [iface.getEventTopic("Burn"), userTopic]),
      scan(supplyTokens, [iface.getEventTopic("Transfer"), null, userTopic]),
      scan(supplyTokens, [iface.getEventTopic("Transfer"), userTopic]),
    ]);

  const eventsByToken = new Map<string, TokenFlowEvent[]>();
  const record = (address: string, event: TokenFlowEvent) => {
    const key = address.toLowerCase();
    const existing = eventsByToken.get(key);
    if (existing) existing.push(event);
    else eventsByToken.set(key, [event]);
  };

  mintLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    record(log.address, {
      kind: "Mint",
      value: args.value.toString(),
      balanceIncrease: args.balanceIncrease.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  burnLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    record(log.address, {
      kind: "Burn",
      value: args.value.toString(),
      balanceIncrease: args.balanceIncrease.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  // Zero-address transfers are the ERC-20 mirror of Mint/Burn events (already
  // counted above), so only user <-> user transfers are principal flows here.
  transferInLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    if (args.from === ethers.constants.AddressZero) return;
    record(log.address, {
      kind: "TransferIn",
      value: args.value.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  transferOutLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    if (args.to === ethers.constants.AddressZero) return;
    record(log.address, {
      kind: "TransferOut",
      value: args.value.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  const eventsFor = (position: ScanPosition) =>
    eventsByToken.get(position.tokenAddress.toLowerCase()) ?? [];
  const touched = positions.filter(
    (position) => eventsFor(position).length > 0,
  );

  const [decimalsByToken, balances] = await Promise.all([
    resolveDecimals(
      provider,
      market.chainId,
      touched.map((position) => position.tokenAddress),
    ),
    mapPooled(touched, 8, async (position) => {
      const token = new ethers.Contract(
        position.tokenAddress,
        TOKEN_ABI,
        provider,
      );
      return (await token.balanceOf(user)) as ethers.BigNumber;
    }),
  ]);

  // Date every block the whole scan needs in one pass, so a block shared by
  // several positions is fetched once. Without a ledger only the first
  // principal event needs a date.
  const blocksNeeded: number[] = [];
  touched.forEach((position) => {
    const events = eventsFor(position);
    if (includeLedger) {
      events.forEach((event) => blocksNeeded.push(event.blockNumber));
      return;
    }
    const first = findFirstPrincipalEvent(events);
    if (first) blocksNeeded.push(first.blockNumber);
  });
  const timestamps = await resolveBlockTimestamps(
    provider,
    market.chainId,
    blocksNeeded,
  );

  const balanceByToken = new Map<string, ethers.BigNumber>();
  touched.forEach((position, index) =>
    balanceByToken.set(position.tokenAddress.toLowerCase(), balances[index]),
  );

  return positions.map((position) => {
    const events = eventsFor(position);
    if (events.length === 0) {
      return { ...position, data: emptyResult(includeLedger) };
    }

    const key = position.tokenAddress.toLowerCase();
    const decimals = decimalsByToken.get(key)!;
    const balance = balanceByToken.get(key)!.toString();

    const accruedRaw = clampRoundingDust(
      getAccruedInterest(balance, events),
      events.length,
    );
    const firstPrincipalEvent = findFirstPrincipalEvent(events);
    const sinceTimestamp = firstPrincipalEvent
      ? (timestamps.get(firstPrincipalEvent.blockNumber) ?? null)
      : null;

    if (!includeLedger) {
      return {
        ...position,
        data: {
          accruedValue: formatUnits(accruedRaw, decimals),
          accruedRaw: accruedRaw.toString(),
          sinceTimestamp,
          eventCount: events.length,
        },
      };
    }

    events.forEach((event) => {
      // eslint-disable-next-line no-param-reassign
      event.timestamp = timestamps.get(event.blockNumber);
    });

    const ledger: LedgerRow[] = buildLedger(events, position.side).map(
      (entry) => ({
        action: entry.action,
        principalDelta: formatUnits(entry.principalDelta, decimals),
        interestRealized: formatUnits(entry.interestRealized, decimals),
        timestamp: entry.timestamp ?? null,
        txHash: entry.transactionHash ?? null,
        blockNumber: entry.blockNumber,
      }),
    );

    const pendingRaw = clampRoundingDust(
      getPendingInterest(balance, events),
      events.length,
    );

    return {
      ...position,
      data: {
        accruedValue: formatUnits(accruedRaw, decimals),
        accruedRaw: accruedRaw.toString(),
        sinceTimestamp,
        eventCount: events.length,
        ledger,
        realizedValue: formatUnits(getRealizedInterest(events), decimals),
        pendingValue: formatUnits(pendingRaw, decimals),
      },
    };
  });
};

/** Spoke reserve decimals, immutable once a reserve is listed. */
const v4DecimalsCache = new Map<string, number>();

/**
 * v4 equivalent of the token-event scan above: Spoke events carry both shares
 * and asset amounts per (reserveId, user), and the current balance comes from
 * the Spoke's own views (premium debt included on the borrow side), so the
 * same "current balance minus net principal" identity applies.
 *
 * Every reserve lives in one Spoke contract, so batching here works on the
 * indexed reserveId topic rather than the address: one request carries the set
 * of reserve ids being scanned. LiquidationCall is indexed by user only, so it
 * is fetched once for the whole scan instead of once per reserve.
 */
const scanPositionsV4 = async (
  market: AaveMarketDataType,
  user: string,
  positions: ScanPosition[],
  includeLedger: boolean,
): Promise<ScanResult[]> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId,
  );
  const spokeAddress = market.v4Addresses!.SPOKE;
  const spoke = new ethers.Contract(spokeAddress, SPOKE_ACCRUAL_ABI, provider);
  const iface = spoke.interface;

  const userTopic = ethers.utils.hexZeroPad(user, 32);
  const latestBlock = await provider.getBlockNumber();
  const firstBlock = market.startBlock ?? 0;
  const logSource: LogSource = market.logApi
    ? explorerLogSource(market.logApi)
    : rpcLogSource(provider);
  const scan = (topics: TopicFilter[]) =>
    queryLogs(logSource, [spokeAddress], topics, firstBlock, latestBlock);

  const reserveTopic = (reserveId: number) =>
    ethers.utils.hexZeroPad(ethers.utils.hexlify(reserveId), 32);

  // The synthetic position ref carries the reserveId.
  const decoded = positions.map((position) => ({
    position,
    reserveId: decodeV4PositionRef(position.tokenAddress),
  }));
  const supplyIds = decoded
    .filter((entry) => entry.position.side === "supply")
    .map((entry) => entry.reserveId);
  const borrowIds = decoded
    .filter((entry) => entry.position.side === "borrow")
    .map((entry) => entry.reserveId);

  const flowScan = (event: string, reserveIds: number[]) =>
    reserveIds.length === 0
      ? Promise.resolve([] as ethers.providers.Log[])
      : scan([
          iface.getEventTopic(event),
          collapse(reserveIds.map(reserveTopic)),
          null,
          userTopic,
        ]);

  const [supplyLogs, withdrawLogs, borrowLogs, repayLogs, liquidationLogs] =
    await Promise.all([
      flowScan("Supply", supplyIds),
      flowScan("Withdraw", supplyIds),
      flowScan("Borrow", borrowIds),
      flowScan("Repay", borrowIds),
      scan([iface.getEventTopic("LiquidationCall"), null, null, userTopic]),
    ]);

  // Keyed by reserveId and side, since one reserve can appear on both.
  const eventsByPosition = new Map<string, SpokeFlowEvent[]>();
  const positionKey = (reserveId: number, side: AccrualSide) =>
    `${reserveId}:${side}`;
  const record = (
    reserveId: number,
    side: AccrualSide,
    event: SpokeFlowEvent,
  ) => {
    const key = positionKey(reserveId, side);
    const existing = eventsByPosition.get(key);
    if (existing) existing.push(event);
    else eventsByPosition.set(key, [event]);
  };

  const recordFlow = (
    logs: ethers.providers.Log[],
    kind: SpokeFlowEvent["kind"],
    side: AccrualSide,
    shares: (args: any) => ethers.BigNumber,
    amount: (args: any) => ethers.BigNumber,
  ) =>
    logs.forEach((log) => {
      const { args } = iface.parseLog(log);
      record(Number(args.reserveId), side, {
        kind,
        shares: shares(args).toString(),
        amount: amount(args).toString(),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
      });
    });

  recordFlow(
    supplyLogs,
    "Supply",
    "supply",
    (args) => args.suppliedShares,
    (args) => args.suppliedAmount,
  );
  recordFlow(
    withdrawLogs,
    "Withdraw",
    "supply",
    (args) => args.withdrawnShares,
    (args) => args.withdrawnAmount,
  );
  recordFlow(
    borrowLogs,
    "Borrow",
    "borrow",
    (args) => args.drawnShares,
    (args) => args.drawnAmount,
  );
  // totalAmountRepaid includes premium debt, matching getUserTotalDebt.
  recordFlow(
    repayLogs,
    "Repay",
    "borrow",
    (args) => args.drawnShares,
    (args) => args.totalAmountRepaid,
  );

  liquidationLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    record(Number(args.collateralReserveId), "supply", {
      kind: "CollateralLiquidated",
      shares: args.collateralSharesLiquidated.toString(),
      amount: args.collateralAmountRemoved.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
    record(Number(args.debtReserveId), "borrow", {
      kind: "DebtLiquidated",
      shares: args.drawnSharesLiquidated.toString(),
      amount: args.debtAmountRestored.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  const eventsFor = (reserveId: number, side: AccrualSide) =>
    eventsByPosition.get(positionKey(reserveId, side)) ?? [];
  const touched = decoded.filter(
    (entry) => eventsFor(entry.reserveId, entry.position.side).length > 0,
  );

  const balances = await mapPooled(
    touched,
    8,
    async (entry) =>
      (entry.position.side === "supply"
        ? spoke.getUserSuppliedAssets(entry.reserveId, user)
        : spoke.getUserTotalDebt(
            entry.reserveId,
            user,
          )) as Promise<ethers.BigNumber>,
  );

  const uncachedIds = [
    ...new Set(
      touched
        .map((entry) => entry.reserveId)
        .filter(
          (reserveId) =>
            !v4DecimalsCache.has(cacheKey(market.chainId, reserveId)),
        ),
    ),
  ];
  await mapPooled(uncachedIds, 8, async (reserveId) => {
    const reserve = await spoke.getReserve(reserveId);
    v4DecimalsCache.set(
      cacheKey(market.chainId, reserveId),
      Number(reserve.decimals),
    );
  });

  const blocksNeeded: number[] = [];
  touched.forEach((entry) => {
    const events = eventsFor(entry.reserveId, entry.position.side);
    if (includeLedger) {
      events.forEach((event) => blocksNeeded.push(event.blockNumber));
      return;
    }
    const first = findFirstPrincipalEventV4(events);
    if (first) blocksNeeded.push(first.blockNumber);
  });
  const timestamps = await resolveBlockTimestamps(
    provider,
    market.chainId,
    blocksNeeded,
  );

  const balanceByPosition = new Map<string, ethers.BigNumber>();
  touched.forEach((entry, index) =>
    balanceByPosition.set(
      positionKey(entry.reserveId, entry.position.side),
      balances[index],
    ),
  );

  return decoded.map(({ position, reserveId }) => {
    const events = eventsFor(reserveId, position.side);
    if (events.length === 0) {
      return { ...position, data: emptyResult(includeLedger) };
    }

    const key = positionKey(reserveId, position.side);
    const decimals = v4DecimalsCache.get(cacheKey(market.chainId, reserveId))!;
    const balance = balanceByPosition.get(key)!.toString();

    const accruedRaw = clampRoundingDust(
      getAccruedInterestV4(balance, events),
      events.length,
    );
    const firstPrincipalEvent = findFirstPrincipalEventV4(events);
    const sinceTimestamp = firstPrincipalEvent
      ? (timestamps.get(firstPrincipalEvent.blockNumber) ?? null)
      : null;

    if (!includeLedger) {
      return {
        ...position,
        data: {
          accruedValue: formatUnits(accruedRaw, decimals),
          accruedRaw: accruedRaw.toString(),
          sinceTimestamp,
          eventCount: events.length,
        },
      };
    }

    events.forEach((event) => {
      // eslint-disable-next-line no-param-reassign
      event.timestamp = timestamps.get(event.blockNumber);
    });

    const ledger: LedgerRow[] = buildLedgerV4(events).map((entry) => ({
      action: entry.action,
      principalDelta: formatUnits(entry.principalDelta, decimals),
      interestRealized: formatUnits(entry.interestRealized, decimals),
      timestamp: entry.timestamp ?? null,
      txHash: entry.transactionHash ?? null,
      blockNumber: entry.blockNumber,
    }));

    // Realized interest is reconstructed from share prices, so pending (the
    // remainder of the exact lifetime total) absorbs any reconstruction noise.
    const realizedRaw = getRealizedInterestV4(events);
    const pendingRaw = accruedRaw.sub(realizedRaw);

    return {
      ...position,
      data: {
        accruedValue: formatUnits(accruedRaw, decimals),
        accruedRaw: accruedRaw.toString(),
        sinceTimestamp,
        eventCount: events.length,
        ledger,
        realizedValue: formatUnits(realizedRaw, decimals),
        pendingValue: formatUnits(
          pendingRaw.isNegative() ? ethers.BigNumber.from(0) : pendingRaw,
          decimals,
        ),
      },
    };
  });
};

/** A reserve's user-facing identity plus the token contracts to scan */
export type ManifestAssetRef = {
  symbol: string;
  aTokenAddress?: string;
  variableDebtTokenAddress?: string;
};

export type ManifestScanItem = {
  symbol: string;
  side: AccrualSide;
  tokenAddress: string;
  data?: AccrualResponse;
  error?: string;
};

/**
 * Scan every provided reserve (supply and variable-borrow side) for this
 * user's complete interest history, including positions that were closed long
 * ago.
 *
 * This is one batched scan rather than one scan per reserve. Scanning a market
 * reserve by reserve costs a few RPC calls per reserve whether or not the user
 * ever touched it — several hundred calls on a market like Aave v3 Ethereum,
 * nearly all of them returning nothing.
 */
export const getAccrualManifest = async (
  market: AaveMarketDataType,
  user: string,
  assets: ManifestAssetRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<ManifestScanItem[]> => {
  const tasks: ManifestScanItem[] = [];
  assets.forEach((asset) => {
    if (asset.aTokenAddress) {
      tasks.push({
        symbol: asset.symbol,
        side: "supply",
        tokenAddress: asset.aTokenAddress,
      });
    }
    if (asset.variableDebtTokenAddress) {
      tasks.push({
        symbol: asset.symbol,
        side: "borrow",
        tokenAddress: asset.variableDebtTokenAddress,
      });
    }
  });

  // A batched scan has no meaningful per-position progress to report: the log
  // queries cover every position at once. Report the total up front so the UI
  // shows a determinate range, then completion.
  onProgress?.(0, tasks.length);

  try {
    const results = await scanPositions(market, user, tasks, true);
    results.forEach((result, index) => {
      tasks[index].data = result.data;
      tasks[index].error = result.error;
    });
  } catch (err: any) {
    const message = err?.message ?? "Failed to fetch";
    tasks.forEach((task) => {
      // eslint-disable-next-line no-param-reassign
      task.error = message;
    });
  }

  onProgress?.(tasks.length, tasks.length);
  return tasks;
};

export default handler;
