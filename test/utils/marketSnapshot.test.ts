/**
 * The snapshot's job is to make 124 prerendered pages share one set of RPC
 * calls, so these tests are mostly about how often the fetcher runs.
 */
import type { MarketReserveStat } from "../../pages/api/aave/index";

const getMarketReserveStats = jest.fn();

jest.mock("../../pages/api/aave/index", () => ({
  getMarketReserveStats: (...args: unknown[]) => getMarketReserveStats(...args),
}));

// No Netlify context and no local cache file: exercise the build path, where
// the module-scope memo is the only thing standing between one build and
// 124 rounds of market fetches.
jest.mock("@netlify/blobs", () => ({
  getStore: () => {
    throw new Error("no netlify context");
  },
}));

// Mocked on "fs", not "fs/promises": the module imports `{ promises as fs }`
// from "fs", so mocking the other specifier lets the real filesystem cache
// leak a snapshot from one test into the next.
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
  };
});

import { markets } from "../../hooks/useAaveData";
import {
  getMarketSnapshot,
  resetMarketSnapshotMemo,
} from "../../utils/marketSnapshot";

const asset = (symbol: string, liquidity = 1_000): MarketReserveStat => ({
  symbol,
  ltv: 0.8,
  liquidationThreshold: 0.825,
  liquidationPenalty: 0.05,
  supplyAPY: 0.0432,
  variableBorrowAPY: 0.0611,
  totalLiquidityUSD: liquidity,
  borrowingEnabled: true,
  usageAsCollateralEnabled: true,
});

beforeEach(() => {
  resetMarketSnapshotMemo();
  getMarketReserveStats.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getMarketSnapshot", () => {
  it("fetches every market once and reuses the result", async () => {
    getMarketReserveStats.mockResolvedValue([asset("WETH")]);

    const first = await getMarketSnapshot();
    expect(getMarketReserveStats).toHaveBeenCalledTimes(markets.length);
    expect(first?.markets).toHaveLength(markets.length);

    // The 123 other prerendered pages must not trigger another round.
    const second = await getMarketSnapshot();
    const third = await getMarketSnapshot();
    expect(getMarketReserveStats).toHaveBeenCalledTimes(markets.length);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("refetches once the memo is cleared", async () => {
    getMarketReserveStats.mockResolvedValue([asset("WETH")]);
    await getMarketSnapshot();
    resetMarketSnapshotMemo();
    await getMarketSnapshot();
    expect(getMarketReserveStats).toHaveBeenCalledTimes(markets.length * 2);
  });

  it("keeps the markets that succeeded when one fails", async () => {
    getMarketReserveStats.mockImplementation((market: { id: string }) =>
      market.id === markets[0].id
        ? Promise.reject(new Error("rpc exploded"))
        : Promise.resolve([asset("WETH")]),
    );

    const snapshot = await getMarketSnapshot();
    expect(snapshot?.markets).toHaveLength(markets.length - 1);
    expect(snapshot?.markets.some((m) => m.id === markets[0].id)).toBe(false);
  });

  it("drops markets that report no reserves", async () => {
    getMarketReserveStats.mockResolvedValue([]);
    expect(await getMarketSnapshot()).toBeNull();
  });

  it("returns null rather than throwing when every market fails", async () => {
    getMarketReserveStats.mockRejectedValue(new Error("rpc exploded"));
    // A failed snapshot must never break a build; the copy renders without it.
    await expect(getMarketSnapshot()).resolves.toBeNull();
  });

  it("caps assets per market and ranks them by liquidity", async () => {
    getMarketReserveStats.mockResolvedValue([
      asset("SMALL", 1),
      asset("BIGGEST", 9_000),
      asset("A", 100),
      asset("B", 200),
      asset("C", 300),
      asset("D", 400),
      asset("E", 500),
      asset("F", 600),
    ]);

    const snapshot = await getMarketSnapshot();
    const first = snapshot!.markets[0];
    expect(first.assets).toHaveLength(6);
    expect(first.assets[0].symbol).toBe("BIGGEST");
    expect(first.assets.map((a) => a.symbol)).not.toContain("SMALL");
  });

  it("stamps a generation time and labels the protocol version", async () => {
    getMarketReserveStats.mockResolvedValue([asset("WETH")]);
    const snapshot = await getMarketSnapshot();
    expect(snapshot?.generatedAt).toBeLessThanOrEqual(Date.now() / 1000);
    snapshot?.markets.forEach((market) => {
      const source = markets.find((m) => m.id === market.id);
      expect(market.version).toBe(source?.v4 ? "v4" : "v3");
    });
  });
});
