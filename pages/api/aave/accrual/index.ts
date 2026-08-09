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

const TOKEN_ABI = [
  "event Mint(address indexed caller, address indexed onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Burn(address indexed from, address indexed target, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
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
  budget: { calls: number } = { calls: 50 }
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
  concurrency: number = 8
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
    Array.from({ length: Math.min(concurrency, unique.length) }, worker)
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
      !market?.v3 ||
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
      !!includeLedger
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
  includeLedger: boolean = false
): Promise<AccrualResponse> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId
  );
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);
  const iface = token.interface;

  const userTopic = ethers.utils.hexZeroPad(user, 32);
  const latestBlock = await provider.getBlockNumber();
  const userLogs = (topics: (string | null)[]) =>
    getLogsChunked(provider, { address: tokenAddress, topics }, 0, latestBlock);

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
    events.length
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
    events.map((event) => event.blockNumber)
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
    events.length
  );

  return {
    accruedValue: formatUnits(accruedRaw, decimals),
    accruedRaw: accruedRaw.toString(),
    sinceTimestamp: firstPrincipalEvent
      ? timestamps.get(firstPrincipalEvent.blockNumber) ?? null
      : null,
    eventCount: events.length,
    ledger,
    realizedValue: formatUnits(getRealizedInterest(events), decimals),
    pendingValue: formatUnits(pendingRaw, decimals),
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
  concurrency: number = 4
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
          true
        );
      } catch (err: any) {
        task.error = err?.message ?? "Failed to fetch";
      }
      done += 1;
      onProgress?.(done, tasks.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );

  return tasks;
};

export default handler;
