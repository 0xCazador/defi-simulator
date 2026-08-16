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

type LogSource = {
  getLogs(filter: ethers.providers.Filter): Promise<ethers.providers.Log[]>;
};

/**
 * getLogs that survives the provider's response-size cap: on a cap error the
 * block range is bisected and both halves fetched, recursively. Hyperactive
 * addresses (10k+ events on one token) resolve in a handful of extra calls.
 * The budget guards against unbounded recursion; other errors are rethrown.
 */
export const getLogsChunked = async (
  provider: LogSource,
  filter: { address: string; topics: (string | null)[] },
  fromBlock: number,
  toBlock: number,
  budget: { calls: number } = { calls: 50 },
): Promise<ethers.providers.Log[]> => {
  budget.calls -= 1;
  try {
    return await provider.getLogs({ ...filter, fromBlock, toBlock });
  } catch (err: any) {
    const text = `${err?.message ?? ""} ${err?.error?.message ?? ""} ${
      err?.body ?? ""
    }`;
    if (
      !LOG_CAP_ERROR.test(text) ||
      budget.calls <= 0 ||
      toBlock - fromBlock < 2
    )
      throw err;
    const mid = fromBlock + Math.floor((toBlock - fromBlock) / 2);
    const [lower, upper] = await Promise.all([
      getLogsChunked(provider, filter, fromBlock, mid, budget),
      getLogsChunked(provider, filter, mid + 1, toBlock, budget),
    ]);
    return [...lower, ...upper];
  }
};

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
    // everything to lowercase.
    const topics = (filter.topics ?? []) as (string | null)[];
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

/**
 * Resolve block timestamps for the given block numbers with a bounded number
 * of concurrent RPC requests. Positions rarely span more than a few dozen
 * unique blocks, so this stays cheap.
 */
const resolveBlockTimestamps = async (
  provider: ethers.providers.StaticJsonRpcProvider,
  blockNumbers: number[],
  concurrency: number = 8,
): Promise<Map<number, number>> => {
  const unique = [...new Set(blockNumbers)];
  const timestamps = new Map<number, number>();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const blockNumber = unique[next];
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      const block = await provider.getBlock(blockNumber);
      timestamps.set(blockNumber, block.timestamp);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, worker),
  );
  return timestamps;
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

export const getAccrualData = async (
  market: AaveMarketDataType,
  user: string,
  tokenAddress: string,
  side: AccrualSide,
  includeLedger: boolean = false,
): Promise<AccrualResponse> => {
  // v4 positions are internal Spoke storage keyed by reserveId; the
  // "tokenAddress" is a synthetic position ref carrying that id.
  if (market.v4) {
    return getV4AccrualData(
      market,
      user,
      decodeV4PositionRef(tokenAddress),
      side,
      includeLedger,
    );
  }

  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId,
  );
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);
  const iface = token.interface;

  const userTopic = ethers.utils.hexZeroPad(user, 32);
  const latestBlock = await provider.getBlockNumber();
  const firstBlock = market.startBlock ?? 0;
  const logSource: LogSource = market.logApi
    ? explorerLogSource(market.logApi)
    : provider;
  const userLogs = (topics: (string | null)[]) =>
    getLogsChunked(
      logSource,
      { address: tokenAddress, topics },
      firstBlock,
      latestBlock,
    );

  // Filtered by the indexed user address, these return the complete event history
  // for this user/token (chunked only if the provider's log cap is hit).
  // Debt tokens are non-transferable, so Transfer queries only apply to the supply side.
  const [
    balance,
    decimals,
    mintLogs,
    burnLogs,
    transferInLogs,
    transferOutLogs,
  ] = await Promise.all([
    token.balanceOf(user) as Promise<ethers.BigNumber>,
    token.decimals() as Promise<number>,
    userLogs([iface.getEventTopic("Mint"), null, userTopic]),
    userLogs([iface.getEventTopic("Burn"), userTopic]),
    side === "supply"
      ? userLogs([iface.getEventTopic("Transfer"), null, userTopic])
      : Promise.resolve([]),
    side === "supply"
      ? userLogs([iface.getEventTopic("Transfer"), userTopic])
      : Promise.resolve([]),
  ]);

  const events: TokenFlowEvent[] = [];

  mintLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    events.push({
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
    events.push({
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
    events.push({
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
    events.push({
      kind: "TransferOut",
      value: args.value.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  const accruedRaw = clampRoundingDust(
    getAccruedInterest(balance.toString(), events),
    events.length,
  );

  const firstPrincipalEvent = findFirstPrincipalEvent(events);

  if (!includeLedger) {
    const sinceTimestamp = firstPrincipalEvent
      ? (await provider.getBlock(firstPrincipalEvent.blockNumber)).timestamp
      : null;

    return {
      accruedValue: formatUnits(accruedRaw, decimals),
      accruedRaw: accruedRaw.toString(),
      sinceTimestamp,
      eventCount: events.length,
    };
  }

  const timestamps = await resolveBlockTimestamps(
    provider,
    events.map((event) => event.blockNumber),
  );
  events.forEach((event) => {
    // eslint-disable-next-line no-param-reassign
    event.timestamp = timestamps.get(event.blockNumber);
  });

  const ledger: LedgerRow[] = buildLedger(events, side).map((entry) => ({
    action: entry.action,
    principalDelta: formatUnits(entry.principalDelta, decimals),
    interestRealized: formatUnits(entry.interestRealized, decimals),
    timestamp: entry.timestamp ?? null,
    txHash: entry.transactionHash ?? null,
    blockNumber: entry.blockNumber,
  }));

  const pendingRaw = clampRoundingDust(
    getPendingInterest(balance.toString(), events),
    events.length,
  );

  return {
    accruedValue: formatUnits(accruedRaw, decimals),
    accruedRaw: accruedRaw.toString(),
    sinceTimestamp: firstPrincipalEvent
      ? (timestamps.get(firstPrincipalEvent.blockNumber) ?? null)
      : null,
    eventCount: events.length,
    ledger,
    realizedValue: formatUnits(getRealizedInterest(events), decimals),
    pendingValue: formatUnits(pendingRaw, decimals),
  };
};

/**
 * v4 equivalent of the token-event scan above: Spoke events carry both shares
 * and asset amounts per (reserveId, user), and the current balance comes from
 * the Spoke's own views (premium debt included on the borrow side), so the
 * same "current balance minus net principal" identity applies.
 */
const getV4AccrualData = async (
  market: AaveMarketDataType,
  user: string,
  reserveId: number,
  side: AccrualSide,
  includeLedger: boolean = false,
): Promise<AccrualResponse> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId,
  );
  const spokeAddress = market.v4Addresses!.SPOKE;
  const spoke = new ethers.Contract(spokeAddress, SPOKE_ACCRUAL_ABI, provider);
  const iface = spoke.interface;

  const userTopic = ethers.utils.hexZeroPad(user, 32);
  const reserveTopic = ethers.utils.hexZeroPad(
    ethers.utils.hexlify(reserveId),
    32,
  );
  const latestBlock = await provider.getBlockNumber();
  const firstBlock = market.startBlock ?? 0;
  const logSource: LogSource = market.logApi
    ? explorerLogSource(market.logApi)
    : provider;
  const scan = (topics: (string | null)[]) =>
    getLogsChunked(
      logSource,
      { address: spokeAddress, topics },
      firstBlock,
      latestBlock,
    );

  const inflowEvent = side === "supply" ? "Supply" : "Borrow";
  const outflowEvent = side === "supply" ? "Withdraw" : "Repay";

  // reserveId and user are both indexed on the flow events, so these return
  // the complete per-reserve history. LiquidationCall indexes the collateral
  // and debt reserve ids in separate topics, so it's fetched per-user and
  // filtered by the relevant reserve below.
  const [balance, reserve, inflowLogs, outflowLogs, liquidationLogs] =
    await Promise.all([
      (side === "supply"
        ? spoke.getUserSuppliedAssets(reserveId, user)
        : spoke.getUserTotalDebt(reserveId, user)) as Promise<ethers.BigNumber>,
      spoke.getReserve(reserveId),
      scan([iface.getEventTopic(inflowEvent), reserveTopic, null, userTopic]),
      scan([iface.getEventTopic(outflowEvent), reserveTopic, null, userTopic]),
      scan([iface.getEventTopic("LiquidationCall"), null, null, userTopic]),
    ]);

  const decimals: number = Number(reserve.decimals);
  const events: SpokeFlowEvent[] = [];

  inflowLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    events.push({
      kind: inflowEvent,
      shares: (side === "supply" ? args.suppliedShares : args.drawnShares).toString(),
      amount: (side === "supply" ? args.suppliedAmount : args.drawnAmount).toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  outflowLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    events.push({
      kind: outflowEvent,
      shares: (side === "supply" ? args.withdrawnShares : args.drawnShares).toString(),
      // totalAmountRepaid includes premium debt, matching getUserTotalDebt.
      amount: (side === "supply"
        ? args.withdrawnAmount
        : args.totalAmountRepaid
      ).toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  });

  liquidationLogs.forEach((log) => {
    const { args } = iface.parseLog(log);
    if (side === "supply" && args.collateralReserveId.eq(reserveId)) {
      events.push({
        kind: "CollateralLiquidated",
        shares: args.collateralSharesLiquidated.toString(),
        amount: args.collateralAmountRemoved.toString(),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
      });
    }
    if (side === "borrow" && args.debtReserveId.eq(reserveId)) {
      events.push({
        kind: "DebtLiquidated",
        shares: args.drawnSharesLiquidated.toString(),
        amount: args.debtAmountRestored.toString(),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
      });
    }
  });

  const accruedRaw = clampRoundingDust(
    getAccruedInterestV4(balance.toString(), events),
    events.length,
  );

  const firstPrincipalEvent = findFirstPrincipalEventV4(events);

  if (!includeLedger) {
    const sinceTimestamp = firstPrincipalEvent
      ? (await provider.getBlock(firstPrincipalEvent.blockNumber)).timestamp
      : null;

    return {
      accruedValue: formatUnits(accruedRaw, decimals),
      accruedRaw: accruedRaw.toString(),
      sinceTimestamp,
      eventCount: events.length,
    };
  }

  const timestamps = await resolveBlockTimestamps(
    provider,
    events.map((event) => event.blockNumber),
  );
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
    accruedValue: formatUnits(accruedRaw, decimals),
    accruedRaw: accruedRaw.toString(),
    sinceTimestamp: firstPrincipalEvent
      ? (timestamps.get(firstPrincipalEvent.blockNumber) ?? null)
      : null,
    eventCount: events.length,
    ledger,
    realizedValue: formatUnits(realizedRaw, decimals),
    pendingValue: formatUnits(
      pendingRaw.isNegative() ? ethers.BigNumber.from(0) : pendingRaw,
      decimals,
    ),
  };
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
 * ago. Runs up to `concurrency` token scans at a time; each token scan is
 * itself a handful of RPC calls, so keep this modest.
 */
export const getAccrualManifest = async (
  market: AaveMarketDataType,
  user: string,
  assets: ManifestAssetRef[],
  onProgress?: (done: number, total: number) => void,
  concurrency: number = 4,
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

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        task.data = await getAccrualData(
          market,
          user,
          task.tokenAddress,
          task.side,
          true,
        );
      } catch (err: any) {
        task.error = err?.message ?? "Failed to fetch";
      }
      done += 1;
      onProgress?.(done, tasks.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );

  return tasks;
};

export default handler;
