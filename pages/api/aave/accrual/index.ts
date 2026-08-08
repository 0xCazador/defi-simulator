import { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { formatUnits } from "ethers/lib/utils";

import { AaveMarketDataType, markets } from "../../../../hooks/useAaveData";
import {
  TokenFlowEvent,
  clampRoundingDust,
  findFirstPrincipalEvent,
  getAccruedInterest,
} from "../../../../utils/tokenEventAccrual";

const TOKEN_ABI = [
  "event Mint(address indexed caller, address indexed onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Burn(address indexed from, address indexed target, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export type AccrualSide = "supply" | "borrow";

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

export type AccrualResponse = {
  /** accrued interest in human-readable token units */
  accruedValue: string;
  /** accrued interest in base units */
  accruedRaw: string;
  /** unix seconds of the first principal-adding event, if any */
  sinceTimestamp: number | null;
  /** number of balance-changing events found for this user/token */
  eventCount: number;
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
    const { marketId, user, tokenAddress, side } = body as {
      marketId: string;
      user: string;
      tokenAddress: string;
      side: AccrualSide;
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
      side
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
  side: AccrualSide
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
    });
  });

  const accruedRaw = clampRoundingDust(
    getAccruedInterest(balance.toString(), events),
    events.length
  );

  const firstPrincipalEvent = findFirstPrincipalEvent(events);
  const sinceTimestamp = firstPrincipalEvent
    ? (await provider.getBlock(firstPrincipalEvent.blockNumber)).timestamp
    : null;

  return {
    accruedValue: formatUnits(accruedRaw, decimals),
    accruedRaw: accruedRaw.toString(),
    sinceTimestamp,
    eventCount: events.length,
  };
};

export default handler;
