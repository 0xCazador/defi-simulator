import fetchMock from "jest-fetch-mock";
import { ethers } from "ethers";
import {
  explorerLogSource,
  getAccrualData,
  getLogsChunked,
} from "../../pages/api/aave/accrual";
import { AaveMarketDataType } from "../../hooks/useAaveData";
import { encodeV4PositionRef } from "../../utils/spokeEventAccrual";

// getAccrualData builds its own provider and token contract, so replace both to
// observe the block range it asks for without touching the network.
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn(),
      providers: {
        ...actual.ethers.providers,
        StaticJsonRpcProvider: jest.fn(),
      },
    },
  };
});

const FILTER = { address: "0xtoken", topics: ["0xtopic"] };

/**
 * Fake provider over synthetic logs (one per block number), which throws the
 * Alchemy-style cap error whenever a request would return more than `cap` logs.
 */
const makeProvider = (logBlocks: number[], cap: number) => {
  const calls: Array<{ fromBlock: number; toBlock: number }> = [];
  return {
    calls,
    getLogs: async ({ fromBlock, toBlock }: any) => {
      calls.push({ fromBlock, toBlock });
      const hits = logBlocks.filter((b) => b >= fromBlock && b <= toBlock);
      if (hits.length > cap) {
        throw new Error(
          'processing response error (body="Log response size exceeded. You can make eth_getLogs requests with up to a 2K block range...")',
        );
      }
      return hits.map((blockNumber) => ({ blockNumber })) as any;
    },
  };
};

describe("getLogsChunked", () => {
  it("returns results from a single call when under the cap", async () => {
    const provider = makeProvider([5, 10, 15], 10);
    const logs = await getLogsChunked(provider, FILTER, 0, 100);
    expect(logs.map((l) => l.blockNumber)).toEqual([5, 10, 15]);
    expect(provider.calls.length).toBe(1);
  });

  it("bisects the range on a cap error and returns the complete set", async () => {
    // 30 logs spread over blocks 0..2999 with a cap of 10 forces recursive splits
    const blocks = Array.from({ length: 30 }, (_, i) => i * 100);
    const provider = makeProvider(blocks, 10);
    const logs = await getLogsChunked(provider, FILTER, 0, 2999);
    expect(logs.map((l) => l.blockNumber)).toEqual(blocks);
    expect(provider.calls.length).toBeGreaterThan(1);
  });

  it("rethrows errors that are not the provider log cap", async () => {
    const provider = {
      getLogs: async () => {
        throw new Error("403 Forbidden: origin not on whitelist");
      },
    };
    await expect(getLogsChunked(provider, FILTER, 0, 100)).rejects.toThrow(
      "whitelist",
    );
  });

  it("gives up once the call budget is exhausted", async () => {
    // every block has a log and the cap is 1, so chunking can never succeed
    const blocks = Array.from({ length: 1000 }, (_, i) => i);
    const provider = makeProvider(blocks, 1);
    await expect(
      getLogsChunked(provider, FILTER, 0, 999, { calls: 20 }),
    ).rejects.toThrow(/response size/i);
    expect(provider.calls.length).toBeLessThanOrEqual(21);
  });
});

describe("explorerLogSource", () => {
  const API = "https://explorer.invalid/api";
  const rawLog = (blockNumber: number, logIndex: string | number) => ({
    address: "0xtoken",
    blockNumber: `0x${blockNumber.toString(16)}`,
    blockHash: "0xblock",
    transactionIndex: "0x1",
    logIndex,
    transactionHash: `0xtx${blockNumber}-${logIndex}`,
    topics: ["0xtopic"],
    data: "0xdata",
  });
  const ok = (result: unknown) =>
    JSON.stringify({ status: "1", message: "OK", result });

  beforeEach(() => fetchMock.resetMocks());

  it("builds an Etherscan-style query with lowercased AND-joined topics", async () => {
    fetchMock.mockResponseOnce(ok([]));
    await explorerLogSource(API).getLogs({
      address: "0xToKeN",
      topics: ["0xMINT", null, "0xUSER"],
      fromBlock: 489_000,
      toBlock: 29_000_000,
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("module")).toBe("logs");
    expect(url.searchParams.get("action")).toBe("getLogs");
    expect(url.searchParams.get("address")).toBe("0xtoken");
    expect(url.searchParams.get("fromBlock")).toBe("489000");
    expect(url.searchParams.get("toBlock")).toBe("29000000");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("offset")).toBe("1000");
    expect(url.searchParams.get("topic0")).toBe("0xmint");
    expect(url.searchParams.get("topic1")).toBeNull();
    expect(url.searchParams.get("topic2")).toBe("0xuser");
    expect(url.searchParams.get("topic0_2_opr")).toBe("and");
  });

  it("emits an operator for every pair of topics, not just adjacent ones", async () => {
    // A v4 Spoke scan filters on three topics: event, reserveId and user.
    // Blockscout rejects the query unless all three pairs carry an operator.
    fetchMock.mockResponseOnce(ok([]));
    await explorerLogSource(API).getLogs({
      address: "0xtoken",
      topics: ["0xSUPPLY", "0xRESERVE", null, "0xUSER"],
      fromBlock: 0,
      toBlock: 1000,
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("topic0")).toBe("0xsupply");
    expect(url.searchParams.get("topic1")).toBe("0xreserve");
    expect(url.searchParams.get("topic2")).toBeNull();
    expect(url.searchParams.get("topic3")).toBe("0xuser");
    expect(url.searchParams.get("topic0_1_opr")).toBe("and");
    expect(url.searchParams.get("topic0_3_opr")).toBe("and");
    expect(url.searchParams.get("topic1_3_opr")).toBe("and");
    expect(url.searchParams.get("topic0_2_opr")).toBeNull();
  });

  it("parses hex fields, strips null-padded topics, treats bare 0x logIndex as zero", async () => {
    // Blockscout pads topics to four entries with nulls.
    const padded = {
      ...rawLog(255, "0x"),
      topics: ["0xtopic", null, null, null],
    };
    // A repeated batch proves completion; the duplicate is dropped.
    fetchMock.mockResponses(ok([padded]), ok([padded]));
    const logs = await explorerLogSource(API).getLogs({
      address: "0xtoken",
      topics: ["0xtopic"],
      fromBlock: 0,
      toBlock: 1000,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].blockNumber).toBe(255);
    expect(logs[0].logIndex).toBe(0);
    expect(logs[0].topics).toEqual(["0xtopic"]);
  });

  it("resumes from the last block until a page adds nothing new", async () => {
    // Explorers clip pages to unknown sizes (Routescan defaults to 100), so a
    // short batch must not be treated as the final one.
    const pageOne = Array.from({ length: 100 }, (_, i) => rawLog(i + 1, 0));
    const pageTwo = [rawLog(100, 0), rawLog(101, 0), rawLog(102, 0)];
    // Final page repeats block 102's log only: nothing new, scan complete.
    const pageThree = [rawLog(102, 0)];
    fetchMock.mockResponses(ok(pageOne), ok(pageTwo), ok(pageThree));

    const logs = await explorerLogSource(API).getLogs({
      address: "0xtoken",
      topics: ["0xtopic"],
      fromBlock: 1,
      toBlock: 5000,
    });

    expect(fetchMock.mock.calls).toHaveLength(3);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(secondUrl.searchParams.get("fromBlock")).toBe("100");
    const thirdUrl = new URL(fetchMock.mock.calls[2][0] as string);
    expect(thirdUrl.searchParams.get("fromBlock")).toBe("102");
    expect(logs).toHaveLength(102);
    expect(logs[logs.length - 1].blockNumber).toBe(102);
  });

  it("treats a string 'No records found' result as empty", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        status: "0",
        message: "No records found",
        result: "No records found",
      }),
    );
    const logs = await explorerLogSource(API).getLogs({
      address: "0xtoken",
      topics: ["0xtopic"],
      fromBlock: 0,
      toBlock: 100,
    });
    expect(logs).toEqual([]);
  });

  it("throws on non-OK responses and explorer error payloads", async () => {
    fetchMock.mockResponseOnce("", { status: 502 });
    await expect(
      explorerLogSource(API).getLogs({
        address: "0xtoken",
        topics: ["0xtopic"],
        fromBlock: 0,
        toBlock: 100,
      }),
    ).rejects.toThrow("HTTP 502");

    fetchMock.mockResponseOnce(
      JSON.stringify({
        status: "0",
        message: "NOTOK",
        result: "Max rate limit reached",
      }),
    );
    await expect(
      explorerLogSource(API).getLogs({
        address: "0xtoken",
        topics: ["0xtopic"],
        fromBlock: 0,
        toBlock: 100,
      }),
    ).rejects.toThrow("Max rate limit reached");
  });
});

describe("getAccrualData scan range", () => {
  const LATEST_BLOCK = 95_784_057;
  const USER = "0x0000000000000000000000000000000000000001";
  const TOKEN = "0x0000000000000000000000000000000000000002";

  const market = (startBlock?: number): AaveMarketDataType => ({
    v3: true,
    id: "TEST_V3",
    title: "Test v3",
    chainId: 1 as AaveMarketDataType["chainId"],
    api: "https://example.invalid/rpc",
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: TOKEN,
      UI_POOL_DATA_PROVIDER: TOKEN,
    },
    explorer: "https://example.invalid/address/{{ADDRESS}}",
    explorerName: "Test",
    startBlock,
  });

  /** Stub an event-free chain, collecting every range getAccrualData requests. */
  const stubChain = () => {
    const ranges: Array<{ fromBlock: number; toBlock: number }> = [];
    (
      ethers.providers.StaticJsonRpcProvider as unknown as jest.Mock
    ).mockImplementation(() => ({
      getBlockNumber: async () => LATEST_BLOCK,
      getLogs: async ({ fromBlock, toBlock }: any) => {
        ranges.push({ fromBlock, toBlock });
        return [];
      },
    }));
    (ethers.Contract as unknown as jest.Mock).mockImplementation(() => ({
      interface: { getEventTopic: (name: string) => `0x${name}` },
      balanceOf: async () => ethers.BigNumber.from(0),
      decimals: async () => 18,
    }));
    return ranges;
  };

  beforeEach(() => jest.clearAllMocks());

  it("starts at the market's startBlock when one is configured", async () => {
    const ranges = stubChain();
    await getAccrualData(market(85_000_000), USER, TOKEN, "supply");

    expect(ranges.length).toBeGreaterThan(0);
    ranges.forEach((range) => {
      expect(range.fromBlock).toBe(85_000_000);
      expect(range.toBlock).toBe(LATEST_BLOCK);
    });
  });

  it("starts at genesis for markets without a startBlock", async () => {
    const ranges = stubChain();
    await getAccrualData(market(), USER, TOKEN, "supply");

    expect(ranges.length).toBeGreaterThan(0);
    ranges.forEach((range) => expect(range.fromBlock).toBe(0));
  });

  it("scans v4 Spoke events keyed by the synthetic position ref", async () => {
    const SPOKE = "0x0000000000000000000000000000000000000003";
    const filters: Array<{ address: string; topics: (string | null)[] }> = [];
    (
      ethers.providers.StaticJsonRpcProvider as unknown as jest.Mock
    ).mockImplementation(() => ({
      getBlockNumber: async () => LATEST_BLOCK,
      getLogs: async ({ address, topics, fromBlock, toBlock }: any) => {
        expect(fromBlock).toBe(24_700_000);
        expect(toBlock).toBe(LATEST_BLOCK);
        filters.push({ address, topics });
        return [];
      },
    }));
    (ethers.Contract as unknown as jest.Mock).mockImplementation(() => ({
      interface: { getEventTopic: (name: string) => `0x${name}` },
      getUserSuppliedAssets: async () => ethers.BigNumber.from(0),
      getUserTotalDebt: async () => ethers.BigNumber.from(0),
      getReserve: async () => ({ decimals: 6 }),
    }));

    const v4Market: AaveMarketDataType = {
      v4: true,
      id: "TEST_V4",
      title: "Test v4",
      chainId: 1 as AaveMarketDataType["chainId"],
      api: "https://example.invalid/rpc",
      v4Addresses: { SPOKE, ORACLE: TOKEN },
      explorer: "https://example.invalid/address/{{ADDRESS}}",
      explorerName: "Test",
      startBlock: 24_700_000,
    };

    const data = await getAccrualData(
      v4Market,
      USER,
      encodeV4PositionRef(3, "supply"),
      "supply",
    );

    // supply-side scan: Supply + Withdraw filtered by (reserveId, user),
    // LiquidationCall by user only (reserve ids sit in different topics)
    const reserveTopic = ethers.utils.hexZeroPad("0x03", 32);
    const userTopic = ethers.utils.hexZeroPad(USER, 32);
    expect(filters).toHaveLength(3);
    filters.forEach((filter) => expect(filter.address).toBe(SPOKE));
    expect(filters.map((f) => f.topics)).toEqual(
      expect.arrayContaining([
        ["0xSupply", reserveTopic, null, userTopic],
        ["0xWithdraw", reserveTopic, null, userTopic],
        ["0xLiquidationCall", null, null, userTopic],
      ]),
    );
    expect(data.eventCount).toBe(0);
    expect(data.accruedRaw).toBe("0");
  });

  it("scans through the explorer API instead of RPC when logApi is set", async () => {
    const ranges = stubChain();
    fetchMock.resetMocks();
    fetchMock.mockResponse(
      JSON.stringify({ status: "1", message: "OK", result: [] }),
    );

    await getAccrualData(
      { ...market(489_000), logApi: "https://explorer.invalid/api" },
      USER,
      TOKEN,
      "supply",
    );

    // All four supply-side filters (Mint, Burn, Transfer in/out) go to the
    // explorer; RPC getLogs is never touched.
    expect(ranges).toHaveLength(0);
    expect(fetchMock.mock.calls).toHaveLength(4);
    fetchMock.mock.calls.forEach(([url]) => {
      const parsed = new URL(url as string);
      expect(parsed.origin + parsed.pathname).toBe(
        "https://explorer.invalid/api",
      );
      expect(parsed.searchParams.get("fromBlock")).toBe("489000");
      expect(parsed.searchParams.get("toBlock")).toBe(String(LATEST_BLOCK));
    });
  });
});
