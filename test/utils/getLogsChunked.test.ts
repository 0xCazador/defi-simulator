import { ethers } from "ethers";
import { getAccrualData, getLogsChunked } from "../../pages/api/aave/accrual";
import { AaveMarketDataType } from "../../hooks/useAaveData";

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
          'processing response error (body="Log response size exceeded. You can make eth_getLogs requests with up to a 2K block range...")'
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
      "whitelist"
    );
  });

  it("gives up once the call budget is exhausted", async () => {
    // every block has a log and the cap is 1, so chunking can never succeed
    const blocks = Array.from({ length: 1000 }, (_, i) => i);
    const provider = makeProvider(blocks, 1);
    await expect(
      getLogsChunked(provider, FILTER, 0, 999, { calls: 20 })
    ).rejects.toThrow(/response size/i);
    expect(provider.calls.length).toBeLessThanOrEqual(21);
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
});
