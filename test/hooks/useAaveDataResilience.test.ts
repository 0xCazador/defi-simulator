import { expect } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useAaveData,
  markets,
  withTimeout,
  MARKET_FETCH_TIMEOUT_MS,
  HealthFactorData,
  AaveHealthFactorData,
  AaveMarketDataType,
} from "../../hooks/useAaveData";
import { getAaveData } from "../../pages/api/aave";
import { getResolvedAddress } from "../../pages/api/resolver";

// The hook calls getAaveData directly (not the /api/aave route), so mock the
// module. The factory avoids loading the real implementation, which pulls in
// ethers providers and other heavy server-side dependencies.
jest.mock("../../pages/api/aave", () => ({
  getAaveData: jest.fn(),
}));

jest.mock("../../pages/api/resolver", () => ({
  getResolvedAddress: jest.fn(),
}));

const mockGetAaveData = getAaveData as jest.Mock;
const mockGetResolvedAddress = getResolvedAddress as jest.Mock;

// An empty (no position) health factor summary. healthFactor -1 mirrors the
// "no debt position" sentinel so the market auto-select stays put in tests.
const emptyPosition = (): AaveHealthFactorData => ({
  healthFactor: -1,
  totalBorrowsUSD: 0,
  availableBorrowsUSD: 0,
  totalCollateralMarketReferenceCurrency: 0,
  totalBorrowsMarketReferenceCurrency: 0,
  currentLiquidationThreshold: 0,
  currentLoanToValue: 0,
  userReservesData: [],
  userBorrowsData: [],
});

const makeSuccessData = (
  address: string,
  market: AaveMarketDataType,
): HealthFactorData => ({
  address,
  resolvedAddress: address,
  fetchError: "",
  isFetching: false,
  lastFetched: Date.now(),
  market,
  marketReferenceCurrencyPriceInUSD: 1,
  fetchedData: emptyPosition(),
  workingData: emptyPosition(),
});

// The hookstate store is module-global and persists between tests, so every
// test uses its own address to avoid cross-test contamination.
describe("useAaveData market resilience", () => {
  beforeEach(() => {
    mockGetAaveData.mockReset();
    mockGetResolvedAddress.mockReset();
    mockGetResolvedAddress.mockImplementation(
      async (address: string) => address,
    );
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  const waitForAllMarketsSettled = async (result: {
    current: ReturnType<typeof useAaveData>;
  }) => {
    await waitFor(() => {
      markets.forEach((market) => {
        expect(
          result.current.addressData?.[market.id]?.lastFetched,
        ).toBeTruthy();
      });
    });
  };

  test("a single failing market doesn't block the others", async () => {
    const address = "0x1000000000000000000000000000000000000001";
    const failingMarketId = "ARBITRUM_V3";

    mockGetAaveData.mockImplementation(
      async (addr: string, market: AaveMarketDataType) => {
        if (market.id === failingMarketId) {
          throw new Error("RPC exploded");
        }
        return makeSuccessData(addr, market);
      },
    );

    const { result } = renderHook(() => useAaveData(address));

    await waitForAllMarketsSettled(result);

    const failed = result.current.addressData?.[failingMarketId];
    expect(failed?.fetchError).toContain("RPC exploded");
    expect(failed?.isFetching).toBe(false);

    markets
      .filter((market) => market.id !== failingMarketId)
      .forEach((market) => {
        const marketData = result.current.addressData?.[market.id];
        expect(marketData?.fetchError).toBe("");
        expect(marketData?.workingData).not.toBeUndefined();
      });

    // Global loading state resolves even though one market failed.
    expect(result.current.isFetching).toBe(false);
  });

  test("resolves ENS once and passes the resolved address to every market fetch", async () => {
    const address = "resilience-test.eth";
    const resolved = "0x2000000000000000000000000000000000000002";

    mockGetResolvedAddress.mockResolvedValue(resolved);
    mockGetAaveData.mockImplementation(
      async (addr: string, market: AaveMarketDataType) =>
        makeSuccessData(addr, market),
    );

    const { result } = renderHook(() => useAaveData(address));

    await waitForAllMarketsSettled(result);

    expect(mockGetResolvedAddress).toHaveBeenCalledTimes(1);
    expect(mockGetAaveData).toHaveBeenCalledTimes(markets.length);
    mockGetAaveData.mock.calls.forEach((call) => {
      expect(call[0]).toBe(address);
      expect(call[2]).toBe(resolved);
    });
  });

  test("marks every market errored (instead of hanging) when address resolution fails", async () => {
    const address = "broken-resolver.eth";

    mockGetResolvedAddress.mockRejectedValue(new Error("resolver down"));

    const { result } = renderHook(() => useAaveData(address));

    await waitForAllMarketsSettled(result);

    markets.forEach((market) => {
      const marketData = result.current.addressData?.[market.id];
      expect(marketData?.fetchError).toContain("resolver down");
      expect(marketData?.isFetching).toBe(false);
    });
    expect(result.current.isFetching).toBe(false);
    expect(mockGetAaveData).not.toHaveBeenCalled();
  });

  test("a market fetch that never settles times out instead of blocking the UI forever", async () => {
    jest.useFakeTimers();
    try {
      const address = "0x3000000000000000000000000000000000000003";
      const hungMarketId = "OPTIMISM_V3";

      mockGetAaveData.mockImplementation(
        async (addr: string, market: AaveMarketDataType) => {
          if (market.id === hungMarketId) {
            return new Promise(() => {}); // never settles
          }
          return makeSuccessData(addr, market);
        },
      );

      const { result } = renderHook(() => useAaveData(address));

      // Let the resolution + market fetches start.
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        jest.advanceTimersByTime(MARKET_FETCH_TIMEOUT_MS + 1000);
      });

      await waitFor(() => {
        const hung = result.current.addressData?.[hungMarketId];
        expect(hung?.fetchError).toContain("Timed out");
        expect(hung?.isFetching).toBe(false);
      });

      expect(result.current.isFetching).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("retryFetchMarket refetches a previously failed market", async () => {
    const address = "0x4000000000000000000000000000000000000004";
    const flakyMarketId = "BASE_V3";
    let shouldFail = true;

    mockGetAaveData.mockImplementation(
      async (addr: string, market: AaveMarketDataType) => {
        if (market.id === flakyMarketId && shouldFail) {
          throw new Error("temporary outage");
        }
        return makeSuccessData(addr, market);
      },
    );

    const { result } = renderHook(() => useAaveData(address));

    await waitForAllMarketsSettled(result);
    expect(result.current.addressData?.[flakyMarketId]?.fetchError).toContain(
      "temporary outage",
    );

    shouldFail = false;
    act(() => {
      result.current.retryFetchMarket(flakyMarketId);
    });

    await waitFor(() => {
      const retried = result.current.addressData?.[flakyMarketId];
      expect(retried?.fetchError).toBe("");
      expect(retried?.workingData).not.toBeUndefined();
      expect(retried?.lastFetched).toBeTruthy();
    });

    // Only the failed market was refetched.
    expect(mockGetAaveData).toHaveBeenCalledTimes(markets.length + 1);
  });

  test("does not auto-select away from a market the user picked", async () => {
    const address = "0x5000000000000000000000000000000000000005";
    let releaseBnb: () => void = () => {};
    const bnbHeld = new Promise<void>((resolve) => {
      releaseBnb = resolve;
    });

    const withPosition = (
      data: HealthFactorData,
      collateral: number,
    ): HealthFactorData => {
      const position: AaveHealthFactorData = {
        ...emptyPosition(),
        healthFactor: 2,
        totalCollateralMarketReferenceCurrency: collateral,
        totalBorrowsMarketReferenceCurrency: collateral / 2,
        totalBorrowsUSD: collateral / 2,
      };
      return { ...data, fetchedData: position, workingData: position };
    };

    mockGetAaveData.mockImplementation(
      async (addr: string, market: AaveMarketDataType) => {
        const data = makeSuccessData(addr, market);
        if (market.id === "BNB_V3") await bnbHeld;
        if (market.id === "ETHEREUM_V3") return withPosition(data, 1_000_000);
        if (market.id === "ARBITRUM_V3") return withPosition(data, 100);
        return data;
      },
    );

    const { result } = renderHook(() => useAaveData(address));

    await waitFor(() => {
      expect(result.current.addressData?.ETHEREUM_V3?.lastFetched).toBeTruthy();
      expect(result.current.addressData?.ARBITRUM_V3?.lastFetched).toBeTruthy();
    });

    // Ethereum is the larger position, so auto-select should have landed there
    // (or stayed, since it is the default) before the user picks.
    expect(result.current.currentMarket).toBe("ETHEREUM_V3");

    act(() => {
      result.current.setCurrentMarket("ARBITRUM_V3");
    });
    expect(result.current.currentMarket).toBe("ARBITRUM_V3");

    await act(async () => {
      releaseBnb();
    });

    await waitFor(() => {
      expect(result.current.addressData?.BNB_V3?.lastFetched).toBeTruthy();
    });

    // A later market completion must not yank the user back to Ethereum.
    expect(result.current.currentMarket).toBe("ARBITRUM_V3");
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("resolves when the promise settles in time", async () => {
    const promise = withTimeout(Promise.resolve("ok"), 1000, "test op");
    await expect(promise).resolves.toBe("ok");
  });

  test("propagates rejections from the wrapped promise", async () => {
    const promise = withTimeout(
      Promise.reject(new Error("inner failure")),
      1000,
      "test op",
    );
    await expect(promise).rejects.toThrow("inner failure");
  });

  test("rejects with a descriptive error when the promise never settles", async () => {
    const promise = withTimeout(new Promise(() => {}), 5000, "fetching data");
    jest.advanceTimersByTime(5001);
    await expect(promise).rejects.toThrow("Timed out after 5s fetching data");
  });
});
