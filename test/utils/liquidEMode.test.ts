import {
  formatEModeLabel,
  isReserveInBitmap,
  resolveEffectiveRiskParams,
} from "../../utils/liquidEMode";

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
