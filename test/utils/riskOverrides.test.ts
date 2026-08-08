import {
  applyEModeCategoryOverrides,
  applyRiskOverridesToAsset,
  createEmptyRiskOverrides,
  decodeRiskConfig,
  encodeRiskConfig,
  flattenRiskOverrides,
  hasAnyRiskOverrides,
  mergeRiskOverrides,
  sanitizeRiskOverrides,
  RiskParamOverrides,
  SharedRiskConfig,
} from "../../utils/riskOverrides";
import { EModeCategoryData } from "../../utils/liquidEMode";

describe("sanitizeRiskOverrides", () => {
  test("passes through valid overrides", () => {
    const clean = sanitizeRiskOverrides({
      assets: {
        WETH: {
          ltv: 7500,
          liquidationThreshold: 8000,
          supplyCap: 100000,
          isFrozen: true,
        },
      },
      eModeCategories: { "1": { ltv: 9000, liquidationThreshold: 9300 } },
      meta: { label: "Test config", ref: "https://governance.aave.com/t/x" },
    });

    expect(clean.assets.WETH).toEqual({
      ltv: 7500,
      liquidationThreshold: 8000,
      supplyCap: 100000,
      isFrozen: true,
    });
    expect(clean.eModeCategories?.["1"]).toEqual({
      ltv: 9000,
      liquidationThreshold: 9300,
    });
    expect(clean.meta).toEqual({
      label: "Test config",
      ref: "https://governance.aave.com/t/x",
    });
  });

  test("clamps bps fields to 0..10000 and drops invalid numbers", () => {
    const clean = sanitizeRiskOverrides({
      assets: {
        WETH: { ltv: 999999, liquidationThreshold: -5 },
        USDC: { supplyCap: NaN, borrowCap: Infinity },
        DAI: { ltv: "not-a-number" },
      },
    });

    expect(clean.assets.WETH).toEqual({ ltv: 10000 });
    expect(clean.assets.USDC).toBeUndefined();
    expect(clean.assets.DAI).toBeUndefined();
  });

  test("enforces liquidation threshold >= ltv when both overridden", () => {
    const clean = sanitizeRiskOverrides({
      assets: { WETH: { ltv: 9000, liquidationThreshold: 8000 } },
      eModeCategories: { "1": { ltv: 9600, liquidationThreshold: 9300 } },
    });

    expect(clean.assets.WETH).toEqual({
      ltv: 8000,
      liquidationThreshold: 8000,
    });
    expect(clean.eModeCategories?.["1"]).toEqual({
      ltv: 9300,
      liquidationThreshold: 9300,
    });
  });

  test("drops unknown fields, bad category ids, and bad meta", () => {
    const clean = sanitizeRiskOverrides({
      assets: {
        WETH: { ltv: 5000, madeUpField: 12345 },
        "": { ltv: 5000 },
      },
      eModeCategories: {
        "999": { ltv: 9000 },
        "-1": { ltv: 9000 },
        abc: { ltv: 9000 },
        "2": { ltv: 8800 },
      },
      meta: { label: "   ", ref: "javascript:alert(1)" },
    });

    expect(clean.assets.WETH).toEqual({ ltv: 5000 });
    expect(clean.assets[""]).toBeUndefined();
    expect(Object.keys(clean.eModeCategories || {})).toEqual(["2"]);
    expect(clean.meta).toBeUndefined();
  });

  test("handles garbage input", () => {
    expect(hasAnyRiskOverrides(sanitizeRiskOverrides(null))).toBe(false);
    expect(hasAnyRiskOverrides(sanitizeRiskOverrides("junk"))).toBe(false);
    expect(hasAnyRiskOverrides(sanitizeRiskOverrides(42))).toBe(false);
    expect(hasAnyRiskOverrides(sanitizeRiskOverrides({ assets: 7 }))).toBe(
      false
    );
  });
});

describe("hasAnyRiskOverrides", () => {
  test("false for empty/absent overrides", () => {
    expect(hasAnyRiskOverrides(undefined)).toBe(false);
    expect(hasAnyRiskOverrides(null)).toBe(false);
    expect(hasAnyRiskOverrides(createEmptyRiskOverrides())).toBe(false);
  });

  test("true when any asset or category override exists", () => {
    expect(
      hasAnyRiskOverrides({ v: 1, assets: { WETH: { ltv: 5000 } } })
    ).toBe(true);
    expect(
      hasAnyRiskOverrides({
        v: 1,
        assets: {},
        eModeCategories: { "1": { ltv: 9000 } },
      })
    ).toBe(true);
  });
});

describe("mergeRiskOverrides", () => {
  test("priority fields win over base, disjoint fields combine", () => {
    const base: RiskParamOverrides = {
      v: 1,
      assets: {
        WETH: { ltv: 7000, liquidationThreshold: 7500 },
        USDC: { borrowCap: 1000 },
      },
      eModeCategories: { "1": { ltv: 9000 } },
      meta: { label: "base" },
    };
    const priority: RiskParamOverrides = {
      v: 1,
      assets: { WETH: { ltv: 6000 } },
      eModeCategories: { "1": { liquidationThreshold: 9400 } },
    };

    const merged = mergeRiskOverrides(base, priority);

    expect(merged.assets.WETH).toEqual({
      ltv: 6000,
      liquidationThreshold: 7500,
    });
    expect(merged.assets.USDC).toEqual({ borrowCap: 1000 });
    expect(merged.eModeCategories?.["1"]).toEqual({
      ltv: 9000,
      liquidationThreshold: 9400,
    });
    expect(merged.meta).toEqual({ label: "base" });
  });

  test("handles absent inputs", () => {
    expect(hasAnyRiskOverrides(mergeRiskOverrides(undefined, null))).toBe(
      false
    );
    const merged = mergeRiskOverrides(undefined, {
      v: 1,
      assets: { WETH: { ltv: 5000 } },
    });
    expect(merged.assets.WETH).toEqual({ ltv: 5000 });
  });
});

describe("applyEModeCategoryOverrides", () => {
  const categories: EModeCategoryData[] = [
    {
      id: 1,
      label: "ETH correlated",
      ltv: 9300,
      liquidationThreshold: 9500,
      collateralBitmap: "3",
      borrowableBitmap: "4",
    },
    {
      id: 2,
      label: "Stablecoins",
      ltv: 9000,
      liquidationThreshold: 9200,
      collateralBitmap: "12",
      borrowableBitmap: "12",
    },
  ];

  test("returns input unchanged when no category overrides", () => {
    expect(applyEModeCategoryOverrides(categories, undefined)).toBe(
      categories
    );
    expect(
      applyEModeCategoryOverrides(categories, createEmptyRiskOverrides())
    ).toBe(categories);
  });

  test("applies overrides without mutating the source", () => {
    const overrides: RiskParamOverrides = {
      v: 1,
      assets: {},
      eModeCategories: { "1": { liquidationThreshold: 9000 } },
    };
    const result = applyEModeCategoryOverrides(categories, overrides) || [];

    expect(result[0].liquidationThreshold).toEqual(9000);
    expect(result[0].ltv).toEqual(9300);
    expect(result[1]).toBe(categories[1]);
    expect(categories[0].liquidationThreshold).toEqual(9500);
  });
});

describe("applyRiskOverridesToAsset", () => {
  const asset = {
    symbol: "WETH",
    baseLTVasCollateral: 8000,
    reserveLiquidationThreshold: 8250,
    supplyCap: 100,
    borrowCap: 0,
    borrowingEnabled: true,
    usageAsCollateralEnabled: true,
    isFrozen: false,
    isPaused: false,
  };

  test("returns the same object when no override exists", () => {
    expect(applyRiskOverridesToAsset(asset, undefined)).toBe(asset);
    expect(
      applyRiskOverridesToAsset(asset, {
        v: 1,
        assets: { USDC: { ltv: 1 } },
      })
    ).toBe(asset);
  });

  test("applies overridden fields, preserves the rest", () => {
    const overridden = applyRiskOverridesToAsset(asset, {
      v: 1,
      assets: {
        WETH: { liquidationThreshold: 7000, isFrozen: true, supplyCap: 50 },
      },
    });

    expect(overridden.reserveLiquidationThreshold).toEqual(7000);
    expect(overridden.isFrozen).toBe(true);
    expect(overridden.supplyCap).toEqual(50);
    expect(overridden.baseLTVasCollateral).toEqual(8000);
    expect(overridden.usageAsCollateralEnabled).toBe(true);
    // source untouched
    expect(asset.reserveLiquidationThreshold).toEqual(8250);
  });
});

describe("flattenRiskOverrides", () => {
  test("lists every overridden field", () => {
    const entries = flattenRiskOverrides({
      v: 1,
      assets: { WETH: { ltv: 7000, isFrozen: true } },
      eModeCategories: { "1": { liquidationThreshold: 9000 } },
    });

    expect(entries).toHaveLength(3);
    expect(entries).toContainEqual({
      kind: "asset",
      key: "WETH",
      field: "ltv",
      value: 7000,
    });
    expect(entries).toContainEqual({
      kind: "asset",
      key: "WETH",
      field: "isFrozen",
      value: true,
    });
    expect(entries).toContainEqual({
      kind: "eModeCategory",
      key: "1",
      field: "liquidationThreshold",
      value: 9000,
    });
  });

  test("empty for absent overrides", () => {
    expect(flattenRiskOverrides(undefined)).toEqual([]);
    expect(flattenRiskOverrides(createEmptyRiskOverrides())).toEqual([]);
  });
});

describe("encodeRiskConfig / decodeRiskConfig", () => {
  const config: SharedRiskConfig = {
    marketId: "ETHEREUM_V3",
    overrides: {
      v: 1,
      assets: {
        WETH: {
          ltv: 7500,
          liquidationThreshold: 8000,
          eModeLtv: 9000,
          eModeLiquidationThreshold: 9200,
          supplyCap: 100000,
          borrowCap: 50000,
          borrowingEnabled: false,
          usageAsCollateralEnabled: true,
          isFrozen: true,
          isPaused: false,
        },
        USDC: { borrowCap: 750000 },
      },
      eModeCategories: { "1": { ltv: 9100, liquidationThreshold: 9400 } },
      meta: {
        label: "Gauntlet update",
        ref: "https://governance.aave.com/t/arfc-example/123",
      },
    },
  };

  test("round-trips a full config", () => {
    const encoded = encodeRiskConfig(config);

    expect(typeof encoded).toBe("string");
    // url-safe: no +, /, =, or raw JSON characters
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

    const decoded = decodeRiskConfig(encoded, ["ETHEREUM_V3", "BASE_V3"]);
    expect(decoded).not.toBeNull();
    expect(decoded?.marketId).toEqual("ETHEREUM_V3");
    expect(decoded?.overrides.assets).toEqual(config.overrides.assets);
    expect(decoded?.overrides.eModeCategories).toEqual(
      config.overrides.eModeCategories
    );
    expect(decoded?.overrides.meta).toEqual(config.overrides.meta);
  });

  test("rejects unknown markets when a market list is provided", () => {
    const encoded = encodeRiskConfig(config);
    expect(decodeRiskConfig(encoded, ["BASE_V3"])).toBeNull();
    // without a market list, market validity is the caller's concern
    expect(decodeRiskConfig(encoded)).not.toBeNull();
  });

  test("rejects malformed payloads", () => {
    expect(decodeRiskConfig("")).toBeNull();
    expect(decodeRiskConfig("!!!not-base64url!!!")).toBeNull();
    expect(decodeRiskConfig("aGVsbG8")).toBeNull(); // "hello" – not JSON
    expect(decodeRiskConfig("x".repeat(10000))).toBeNull(); // oversized

    const toB64Url = (value: string) =>
      Buffer.from(value, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    // wrong version
    expect(
      decodeRiskConfig(toB64Url(JSON.stringify({ v: 2, m: "ETHEREUM_V3" })))
    ).toBeNull();
    // missing market
    expect(
      decodeRiskConfig(
        toB64Url(JSON.stringify({ v: 1, a: { WETH: { l: 5000 } } }))
      )
    ).toBeNull();
    // no effective overrides after sanitization
    expect(
      decodeRiskConfig(
        toB64Url(
          JSON.stringify({
            v: 1,
            m: "ETHEREUM_V3",
            a: { WETH: { l: -100, junk: 5 } },
          })
        )
      )
    ).toBeNull();
  });

  test("drops invalid fields but keeps the valid remainder", () => {
    const toB64Url = (value: string) =>
      Buffer.from(value, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const decoded = decodeRiskConfig(
      toB64Url(
        JSON.stringify({
          v: 1,
          m: "ETHEREUM_V3",
          a: {
            WETH: { t: 99999, l: -5, zz: 1 },
            USDC: { bc: "750000" },
          },
          e: { "300": { l: 9000 }, "1": { t: 9100 } },
        })
      ),
      ["ETHEREUM_V3"]
    );

    expect(decoded).not.toBeNull();
    // t clamped to max bps, l dropped (negative), zz unknown
    expect(decoded?.overrides.assets.WETH).toEqual({
      liquidationThreshold: 10000,
    });
    // numeric strings are coerced
    expect(decoded?.overrides.assets.USDC).toEqual({ borrowCap: 750000 });
    // category 300 out of range, category 1 kept
    expect(Object.keys(decoded?.overrides.eModeCategories || {})).toEqual([
      "1",
    ]);
  });
});
