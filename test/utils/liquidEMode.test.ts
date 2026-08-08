import { ethers } from "ethers";
import {
  EMODE_SCAN_BATCH_SIZE,
  fetchEModeCategories,
  formatEModeLabel,
  isReserveInBitmap,
  resolveEffectiveRiskParams,
} from "../../utils/liquidEMode";

// fetchEModeCategories constructs an ethers Contract internally; replace the
// constructor so tests can supply an in-memory pool.
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn(),
    },
  };
});

const mockContract = ethers.Contract as unknown as jest.Mock;

describe("formatEModeLabel", () => {
  it("returns empty string for missing labels", () => {
    expect(formatEModeLabel(undefined)).toBe("");
    expect(formatEModeLabel("")).toBe("");
  });

  it("leaves human-readable labels unchanged", () => {
    expect(formatEModeLabel("ETH correlated")).toBe("ETH correlated");
    expect(formatEModeLabel("eBTC/WBTC")).toBe("eBTC/WBTC");
  });

  it("beautifies underscore-formatted labels", () => {
    expect(formatEModeLabel("rsETH__ETH_wstETH_ETHx")).toBe(
      "rsETH / ETH wstETH ETHx"
    );
    expect(formatEModeLabel("LINK__USDC_USDT")).toBe("LINK / USDC USDT");
    expect(formatEModeLabel("LBTC_WBTC")).toBe("LBTC WBTC");
    expect(formatEModeLabel("PT_USDG_28MAY2026__Stablecoins")).toBe(
      "PT USDG 28MAY2026 / Stablecoins"
    );
  });

  it("truncates long labels with an ellipsis", () => {
    const formatted = formatEModeLabel(
      "PT_srUSDe_2APR2026_sUSDe__USDT_USDe_USDC"
    );
    expect(formatted.length).toBeLessThanOrEqual(32);
    expect(formatted.endsWith("…")).toBe(true);
  });
});

describe("fetchEModeCategories", () => {
  type MockCategory = {
    ltv: number;
    liquidationThreshold: number;
    label?: string;
    collateralBitmap?: string;
    borrowableBitmap?: string;
  };

  // Unconfigured category ids return zeroed config structs on-chain (they
  // don't revert), which the scanner treats as a miss.
  const makePool = (categories: Record<number, MockCategory>) => ({
    getEModeCategoryCollateralConfig: jest.fn(async (id: number) => ({
      ltv: categories[id]?.ltv ?? 0,
      liquidationThreshold: categories[id]?.liquidationThreshold ?? 0,
      liquidationBonus: 0,
    })),
    getEModeCategoryLabel: jest.fn(
      async (id: number) => categories[id]?.label ?? ""
    ),
    getEModeCategoryCollateralBitmap: jest.fn(async (id: number) =>
      BigInt(categories[id]?.collateralBitmap ?? "0")
    ),
    getEModeCategoryBorrowableBitmap: jest.fn(async (id: number) =>
      BigInt(categories[id]?.borrowableBitmap ?? "0")
    ),
  });

  const provider = {} as any;

  beforeEach(() => {
    mockContract.mockReset();
  });

  it("returns all configured categories, tolerating small id gaps", async () => {
    const pool = makePool({
      1: { ltv: 9300, liquidationThreshold: 9500, label: "ETH correlated", collateralBitmap: "3", borrowableBitmap: "1" },
      2: { ltv: 9000, liquidationThreshold: 9200, label: "Stablecoins", collateralBitmap: "264", borrowableBitmap: "8" },
      4: { ltv: 8500, liquidationThreshold: 8800, label: "LST", collateralBitmap: "16", borrowableBitmap: "2" },
    });
    mockContract.mockImplementation(() => pool);

    const categories = await fetchEModeCategories(provider, "0xpool");

    expect(categories.map((c) => c.id)).toEqual([1, 2, 4]);
    expect(categories[0]).toEqual({
      id: 1,
      label: "ETH correlated",
      ltv: 9300,
      liquidationThreshold: 9500,
      collateralBitmap: "3",
      borrowableBitmap: "1",
    });
  });

  it("stops scanning after three consecutive empty slots", async () => {
    const pool = makePool({
      1: { ltv: 9300, liquidationThreshold: 9500 },
    });
    mockContract.mockImplementation(() => pool);

    const categories = await fetchEModeCategories(provider, "0xpool");

    expect(categories.map((c) => c.id)).toEqual([1]);
    // Only the first batch of ids should have been probed.
    const probedIds = pool.getEModeCategoryCollateralConfig.mock.calls.map(
      (call) => call[0]
    );
    expect(Math.max(...probedIds)).toBeLessThanOrEqual(EMODE_SCAN_BATCH_SIZE);
  });

  it("resets the miss counter on a hit, including across batch boundaries", async () => {
    const pool = makePool({
      1: { ltv: 9300, liquidationThreshold: 9500 },
      2: { ltv: 9000, liquidationThreshold: 9200 },
      3: { ltv: 8000, liquidationThreshold: 8300 },
      4: { ltv: 8100, liquidationThreshold: 8400 },
      5: { ltv: 8200, liquidationThreshold: 8500 },
      6: { ltv: 8300, liquidationThreshold: 8600 },
      7: { ltv: 8400, liquidationThreshold: 8700 },
      // 8 unset (1 miss), then hits continue in the second batch
      9: { ltv: 8500, liquidationThreshold: 8800 },
      10: { ltv: 8600, liquidationThreshold: 8900 },
    });
    mockContract.mockImplementation(() => pool);

    const categories = await fetchEModeCategories(provider, "0xpool");

    expect(categories.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10]);
    // Scan should stop within the second batch (ids 11-13 are 3 misses).
    const probedIds = pool.getEModeCategoryCollateralConfig.mock.calls.map(
      (call) => call[0]
    );
    expect(Math.max(...probedIds)).toBeLessThanOrEqual(
      EMODE_SCAN_BATCH_SIZE * 2
    );
  });

  it("treats config call failures as misses", async () => {
    const pool = makePool({});
    pool.getEModeCategoryCollateralConfig.mockRejectedValue(
      new Error("execution reverted")
    );
    mockContract.mockImplementation(() => pool);

    const categories = await fetchEModeCategories(provider, "0xpool");

    expect(categories).toEqual([]);
  });

  it("tolerates label fetch failures", async () => {
    const pool = makePool({
      1: { ltv: 9300, liquidationThreshold: 9500, collateralBitmap: "3" },
    });
    pool.getEModeCategoryLabel.mockRejectedValue(new Error("no label getter"));
    mockContract.mockImplementation(() => pool);

    const categories = await fetchEModeCategories(provider, "0xpool");

    expect(categories).toHaveLength(1);
    expect(categories[0].label).toBe("");
    expect(categories[0].collateralBitmap).toBe("3");
  });
});

describe("isReserveInBitmap", () => {
  // ETH correlated collateralBitmap 2952790659 includes reserve ids 0 and 1 (WETH, wstETH)
  const ethCorrelatedCollateral = "2952790659";

  it("detects set bits", () => {
    expect(isReserveInBitmap(ethCorrelatedCollateral, 0)).toBe(true); // WETH
    expect(isReserveInBitmap(ethCorrelatedCollateral, 1)).toBe(true); // wstETH
  });

  it("rejects unset bits", () => {
    expect(isReserveInBitmap(ethCorrelatedCollateral, 3)).toBe(false); // USDC
    expect(isReserveInBitmap(ethCorrelatedCollateral, 30)).toBe(false);
  });
});

describe("resolveEffectiveRiskParams", () => {
  const eModes = [
    {
      id: 1,
      label: "ETH correlated",
      ltv: 9300,
      liquidationThreshold: 9500,
      collateralBitmap: "2952790659",
      borrowableBitmap: "1",
    },
    {
      id: 2,
      label: "sUSDe Stablecoins",
      ltv: 9000,
      liquidationThreshold: 9200,
      collateralBitmap: "5368709120", // bit 32-ish; use a known bit
      borrowableBitmap: "264",
    },
  ];

  it("uses liquid eMode category LTV/LT when asset is in the collateral bitmap", () => {
    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId: 1,
      eModes,
      reserveId: 1, // wstETH
      baseLtv: 7850,
      baseLiquidationThreshold: 8100,
      legacyEModeCategoryId: 1,
      legacyEModeLtv: 9300,
      legacyEModeLiquidationThreshold: 9500,
    });
    expect(risk).toEqual({ ltv: 9300, liquidationThreshold: 9500, isEMode: true });
  });

  it("falls back to base params when asset is not in the active eMode bitmap", () => {
    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId: 1,
      eModes,
      reserveId: 3, // USDC — not ETH-correlated collateral
      baseLtv: 7500,
      baseLiquidationThreshold: 7800,
      legacyEModeCategoryId: 0,
    });
    expect(risk).toEqual({ ltv: 7500, liquidationThreshold: 7800, isEMode: false });
  });

  it("uses liquid eMode even when legacy eModeCategoryId is 0", () => {
    // Typical liquid-eMode asset: participates only via bitmap
    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId: 2,
      eModes: [
        {
          ...eModes[1],
          collateralBitmap: (1n << 36n).toString(), // pretend reserve 36
        },
      ],
      reserveId: 36,
      baseLtv: 6500,
      baseLiquidationThreshold: 7000,
      legacyEModeCategoryId: 0,
    });
    expect(risk).toEqual({ ltv: 9000, liquidationThreshold: 9200, isEMode: true });
  });

  it("falls back to legacy per-reserve eMode fields when bitmaps are unavailable", () => {
    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId: 1,
      eModes: [],
      baseLtv: 7850,
      baseLiquidationThreshold: 8100,
      legacyEModeCategoryId: 1,
      legacyEModeLtv: 9300,
      legacyEModeLiquidationThreshold: 9500,
    });
    expect(risk).toEqual({ ltv: 9300, liquidationThreshold: 9500, isEMode: true });
  });

  it("uses base params when user is not in eMode", () => {
    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId: 0,
      eModes,
      reserveId: 1,
      baseLtv: 7850,
      baseLiquidationThreshold: 8100,
      legacyEModeCategoryId: 1,
      legacyEModeLtv: 9300,
      legacyEModeLiquidationThreshold: 9500,
    });
    expect(risk).toEqual({ ltv: 7850, liquidationThreshold: 8100, isEMode: false });
  });
});
