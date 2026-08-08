import { expect } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useAaveData,
  updateDerivedHealthFactorData,
  AaveHealthFactorData,
  AssetDetails,
} from "../../hooks/useAaveData";
import { HealthFactorDataStore } from "../../store/healthFactorDataStore";
import {
  sanitizeRiskOverrides,
  RiskParamOverrides,
} from "../../utils/riskOverrides";
import { getAaveData } from "../../pages/api/aave";

// The hook calls getAaveData directly (not the /api/aave route), so mock the
// module. The factory avoids loading the real implementation, which pulls in
// ethers providers and other heavy server-side dependencies.
jest.mock("../../pages/api/aave", () => ({
  getAaveData: jest.fn(),
}));

const mockGetAaveData = getAaveData as jest.Mock;

const PRECISION = 6;
const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";

/**
 * Synthetic position, chosen so expected values are simple to derive
 * (marketReferenceCurrency == USD):
 *
 *   ETH:    10 @ $2000 = $20,000 collateral (LTV 80.00%, LT 82.50%)
 *   wstETH:  5 @ $2400 = $12,000 collateral (LTV 75.00%, LT 80.00%)
 *   USDC borrow: $10,000
 *
 * Base:   LT weighted  = (0.825*20000 + 0.80*12000) / 32000 = 0.815625
 *         HF           = 32000 * 0.815625 / 10000        = 2.6100
 *         availableUSD = 32000 * 0.78125 - 10000         = 15000
 * E-Mode: (LTV 93.00%, LT 95.00% for both reserves)
 *         HF           = 32000 * 0.95 / 10000            = 3.0400
 */
const makeAsset = (overrides: Partial<AssetDetails>): AssetDetails => ({
  symbol: "X",
  name: "X",
  priceInUSD: 1,
  priceInMarketReferenceCurrency: 1,
  baseLTVasCollateral: 0,
  reserveLiquidationThreshold: 0,
  reserveFactor: 0,
  usageAsCollateralEnabled: true,
  initialPriceInUSD: 1,
  ...overrides,
});

type EModeVariant = "none" | "liquid" | "legacy";

const buildPosition = (
  emode: EModeVariant = "none"
): AaveHealthFactorData => {
  const legacyEModeFields =
    emode === "legacy"
      ? {
        eModeCategoryId: 1,
        eModeLtv: 9300,
        eModeLiquidationThreshold: 9500,
      }
      : {};

  const eth = makeAsset({
    symbol: "ETH",
    name: "Ethereum",
    priceInUSD: 2000,
    initialPriceInUSD: 2000,
    baseLTVasCollateral: 8000,
    reserveLiquidationThreshold: 8250,
    reserveId: 0,
    supplyCap: 100,
    borrowingEnabled: true,
    isActive: true,
    ...legacyEModeFields,
  });

  const wsteth = makeAsset({
    symbol: "WSTETH",
    name: "Wrapped stETH",
    priceInUSD: 2400,
    initialPriceInUSD: 2400,
    baseLTVasCollateral: 7500,
    reserveLiquidationThreshold: 8000,
    reserveId: 1,
    borrowingEnabled: false,
    isActive: true,
    ...legacyEModeFields,
  });

  const usdc = makeAsset({
    symbol: "USDC",
    name: "USD Coin",
    priceInUSD: 1,
    initialPriceInUSD: 1,
    borrowCap: 50000,
    borrowingEnabled: true,
    isActive: true,
  });

  const data: AaveHealthFactorData = {
    address: TEST_ADDRESS,
    healthFactor: 0,
    totalBorrowsUSD: 0,
    availableBorrowsUSD: 0,
    totalCollateralMarketReferenceCurrency: 0,
    totalBorrowsMarketReferenceCurrency: 0,
    currentLiquidationThreshold: 0,
    currentLoanToValue: 0,
    userReservesData: [
      {
        asset: eth,
        underlyingBalance: 10,
        underlyingBalanceUSD: 20000,
        underlyingBalanceMarketReferenceCurrency: 20000,
        usageAsCollateralEnabledOnUser: true,
      },
      {
        asset: wsteth,
        underlyingBalance: 5,
        underlyingBalanceUSD: 12000,
        underlyingBalanceMarketReferenceCurrency: 12000,
        usageAsCollateralEnabledOnUser: true,
      },
    ],
    userBorrowsData: [
      {
        asset: usdc,
        totalBorrows: 10000,
        totalBorrowsUSD: 10000,
        totalBorrowsMarketReferenceCurrency: 10000,
        stableBorrowAPY: 0,
      },
    ],
    userEmodeCategoryId: emode === "none" ? 0 : 1,
  };

  if (emode === "liquid") {
    data.eModes = [
      {
        id: 1,
        label: "ETH correlated",
        ltv: 9300,
        liquidationThreshold: 9500,
        collateralBitmap: "3", // reserve ids 0 and 1
        borrowableBitmap: "7",
      },
    ];
  }

  // Make derived fields (HF, LT, availableBorrows...) internally consistent.
  updateDerivedHealthFactorData(data, 1);
  return data;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("updateDerivedHealthFactorData with risk overrides", () => {
  test("base position computes expected values without overrides", () => {
    const data = buildPosition();
    expect(data.healthFactor).toBeCloseTo(2.61, PRECISION);
    expect(data.availableBorrowsUSD).toBeCloseTo(15000, PRECISION);
    expect(data.currentLiquidationThreshold).toBeCloseTo(0.815625, PRECISION);
  });

  test("liquidation threshold override changes health factor", () => {
    const data = clone(buildPosition());
    const overrides = sanitizeRiskOverrides({
      assets: { ETH: { liquidationThreshold: 9000 } },
    });

    updateDerivedHealthFactorData(data, 1, overrides);

    // (0.90*20000 + 0.80*12000) / 10000 = 2.76
    expect(data.healthFactor).toBeCloseTo(2.76, PRECISION);
    // per-asset effective values reflect the override
    const eth = data.userReservesData.find((r) => r.asset.symbol === "ETH");
    expect(eth?.asset.effectiveLiquidationThreshold).toEqual(9000);
  });

  test("ltv override changes available borrows but not health factor", () => {
    const data = clone(buildPosition());
    const overrides = sanitizeRiskOverrides({
      assets: { ETH: { ltv: 9000 } },
    });

    updateDerivedHealthFactorData(data, 1, overrides);

    // (0.90*20000 + 0.75*12000) - 10000 = 17000
    expect(data.availableBorrowsUSD).toBeCloseTo(17000, PRECISION);
    expect(data.healthFactor).toBeCloseTo(2.61, PRECISION);
  });

  test("collateral-disable override drops the asset's contribution", () => {
    const data = clone(buildPosition());
    const overrides = sanitizeRiskOverrides({
      assets: { ETH: { usageAsCollateralEnabled: false } },
    });

    updateDerivedHealthFactorData(data, 1, overrides);

    // Only wstETH counts: 12000 * 0.80 / 10000 = 0.96
    expect(data.healthFactor).toBeCloseTo(0.96, PRECISION);
    expect(data.totalCollateralMarketReferenceCurrency).toBeCloseTo(
      12000,
      PRECISION
    );
  });

  test("recomputing without overrides restores on-chain values", () => {
    const data = clone(buildPosition());
    const overrides = sanitizeRiskOverrides({
      assets: {
        ETH: { liquidationThreshold: 9000, usageAsCollateralEnabled: false },
      },
    });

    updateDerivedHealthFactorData(data, 1, overrides);
    expect(data.healthFactor).not.toBeCloseTo(2.61, 2);

    updateDerivedHealthFactorData(data, 1);
    expect(data.healthFactor).toBeCloseTo(2.61, PRECISION);
    expect(data.availableBorrowsUSD).toBeCloseTo(15000, PRECISION);
  });

  describe("liquid e-mode positions", () => {
    test("e-mode category values apply without overrides", () => {
      const data = buildPosition("liquid");
      expect(data.healthFactor).toBeCloseTo(3.04, PRECISION);
    });

    test("category override wins for e-mode collateral", () => {
      const data = clone(buildPosition("liquid"));
      const overrides = sanitizeRiskOverrides({
        eModeCategories: { "1": { liquidationThreshold: 9000 } },
      });

      updateDerivedHealthFactorData(data, 1, overrides);

      // 32000 * 0.90 / 10000 = 2.88
      expect(data.healthFactor).toBeCloseTo(2.88, PRECISION);
    });

    test("base param override has no effect on e-mode collateral", () => {
      const data = clone(buildPosition("liquid"));
      const overrides = sanitizeRiskOverrides({
        assets: { ETH: { liquidationThreshold: 5000 } },
      });

      updateDerivedHealthFactorData(data, 1, overrides);

      expect(data.healthFactor).toBeCloseTo(3.04, PRECISION);
    });
  });

  describe("legacy e-mode positions", () => {
    test("legacy e-mode values apply without overrides", () => {
      const data = buildPosition("legacy");
      expect(data.healthFactor).toBeCloseTo(3.04, PRECISION);
    });

    test("per-asset e-mode override applies", () => {
      const data = clone(buildPosition("legacy"));
      const overrides = sanitizeRiskOverrides({
        assets: { ETH: { eModeLiquidationThreshold: 9000 } },
      });

      updateDerivedHealthFactorData(data, 1, overrides);

      // (0.90*20000 + 0.95*12000) / 10000 = 2.94
      expect(data.healthFactor).toBeCloseTo(2.94, PRECISION);
    });
  });
});

describe("useAaveData risk override mutators", () => {
  beforeEach(() => {
    // Reset the global store so tests don't leak state into one another.
    const store = HealthFactorDataStore as any;
    store.addressData.set({});
    store.currentAddress.set("");
    store.currentMarket.set("ETHEREUM_V3");
    store.riskOverrides.set({});
    store.sharedRiskConfig.set(null);
    store.sharedRiskConfigEnabled.set(true);

    mockGetAaveData.mockReset();
    const seed = buildPosition();
    mockGetAaveData.mockImplementation(async () =>
      JSON.parse(
        JSON.stringify({
          address: TEST_ADDRESS,
          marketReferenceCurrencyPriceInUSD: 1,
          fetchedData: seed,
          workingData: seed,
          lastFetched: Date.now(),
        })
      )
    );
  });

  const setup = async () => {
    const rendered = renderHook(() => useAaveData(TEST_ADDRESS));
    await waitFor(() => {
      const data =
        rendered.result.current.addressData?.[
        rendered.result.current.currentMarket
        ];
      expect(data?.workingData).not.toBeUndefined();
    });
    return rendered;
  };

  const getWorkingData = (result: any) =>
    result.current.addressData?.[result.current.currentMarket]?.workingData;

  test("setAssetRiskOverride modifies health factor; clearAssetRiskOverride restores it", async () => {
    const { result } = await setup();
    const originalHF = getWorkingData(result)?.healthFactor;

    act(() => {
      result.current.setAssetRiskOverride("ETH", {
        liquidationThreshold: 9000,
      });
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(2.76, PRECISION);
    expect(
      result.current.addressData?.[result.current.currentMarket]?.fetchedData
        ?.healthFactor
    ).toBeCloseTo(originalHF, PRECISION); // fetched data untouched

    act(() => {
      result.current.clearAssetRiskOverride("ETH");
    });

    expect(getWorkingData(result)?.healthFactor.toFixed(PRECISION)).toEqual(
      originalHF.toFixed(PRECISION)
    );
    // fully-cleared override entries are pruned from the store
    expect(result.current.riskOverrides).toBeUndefined();
  });

  test("ltv override modifies available borrows", async () => {
    const { result } = await setup();

    act(() => {
      result.current.setAssetRiskOverride("ETH", { ltv: 9000 });
    });

    expect(getWorkingData(result)?.availableBorrowsUSD).toBeCloseTo(
      17000,
      PRECISION
    );
  });

  test("collateral-disable override drops contribution and restores on clear", async () => {
    const { result } = await setup();
    const originalHF = getWorkingData(result)?.healthFactor;

    act(() => {
      result.current.setAssetRiskOverride("ETH", {
        usageAsCollateralEnabled: false,
      });
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(0.96, PRECISION);

    act(() => {
      result.current.setAssetRiskOverride("ETH", {
        usageAsCollateralEnabled: undefined,
      });
    });

    expect(getWorkingData(result)?.healthFactor.toFixed(PRECISION)).toEqual(
      originalHF.toFixed(PRECISION)
    );
  });

  test("clearAllRiskOverrides removes every override", async () => {
    const { result } = await setup();
    const originalHF = getWorkingData(result)?.healthFactor;

    act(() => {
      result.current.setAssetRiskOverride("ETH", {
        liquidationThreshold: 9000,
      });
      result.current.setAssetRiskOverride("WSTETH", { ltv: 5000 });
    });

    expect(getWorkingData(result)?.healthFactor).not.toBeCloseTo(
      originalHF,
      2
    );

    act(() => {
      result.current.clearAllRiskOverrides();
    });

    expect(getWorkingData(result)?.healthFactor.toFixed(PRECISION)).toEqual(
      originalHF.toFixed(PRECISION)
    );
    expect(result.current.riskOverrides).toBeUndefined();
  });

  test("resetCurrentMarketChanges keeps risk overrides applied (independent reset scopes)", async () => {
    const { result } = await setup();

    act(() => {
      result.current.setAssetRiskOverride("ETH", {
        liquidationThreshold: 9000,
      });
    });
    const overriddenHF = getWorkingData(result)?.healthFactor;
    expect(overriddenHF).toBeCloseTo(2.76, PRECISION);

    act(() => {
      result.current.setReserveAssetQuantity("ETH", 20);
    });
    expect(getWorkingData(result)?.healthFactor).not.toBeCloseTo(
      overriddenHF,
      2
    );

    act(() => {
      result.current.resetCurrentMarketChanges();
    });

    // quantity edit reverted, override still in effect
    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(
      2.76,
      PRECISION
    );
    expect(result.current.riskOverrides).not.toBeUndefined();
  });

  test("shared config applies, toggles off/on, and merges under manual edits", async () => {
    const { result } = await setup();
    const originalHF = getWorkingData(result)?.healthFactor;

    const config = {
      marketId: result.current.currentMarket,
      overrides: sanitizeRiskOverrides({
        assets: { ETH: { liquidationThreshold: 9000 } },
      }) as RiskParamOverrides,
    };

    act(() => {
      result.current.setSharedRiskConfig(config);
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(2.76, PRECISION);

    act(() => {
      result.current.setSharedRiskConfigEnabled(false);
    });

    expect(getWorkingData(result)?.healthFactor.toFixed(PRECISION)).toEqual(
      originalHF.toFixed(PRECISION)
    );

    act(() => {
      result.current.setSharedRiskConfigEnabled(true);
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(2.76, PRECISION);

    // manual edits take precedence over the shared config, field by field
    act(() => {
      result.current.setAssetRiskOverride("ETH", {
        liquidationThreshold: 8500,
      });
    });

    // (0.85*20000 + 0.80*12000) / 10000 = 2.66
    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(2.66, PRECISION);

    // removing the config leaves the manual edit in place
    act(() => {
      result.current.setSharedRiskConfig(null);
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(2.66, PRECISION);
  });

  test("e-mode category override via hook mutator", async () => {
    const store = HealthFactorDataStore as any;
    store.addressData.set({});
    mockGetAaveData.mockReset();
    const seed = buildPosition("liquid");
    mockGetAaveData.mockImplementation(async () =>
      JSON.parse(
        JSON.stringify({
          address: TEST_ADDRESS,
          marketReferenceCurrencyPriceInUSD: 1,
          fetchedData: seed,
          workingData: seed,
          lastFetched: Date.now(),
        })
      )
    );

    const { result } = await setup();
    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(3.04, PRECISION);

    act(() => {
      result.current.setEModeCategoryRiskOverride(1, {
        liquidationThreshold: 9000,
      });
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(2.88, PRECISION);

    act(() => {
      result.current.clearEModeCategoryRiskOverride(1);
    });

    expect(getWorkingData(result)?.healthFactor).toBeCloseTo(3.04, PRECISION);
  });
});
