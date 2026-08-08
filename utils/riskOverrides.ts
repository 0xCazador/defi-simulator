import { EModeCategoryData } from "./liquidEMode";

/**
 * Declarative, serializable overrides for per-asset (and per-eMode-category)
 * risk parameters. Overrides are never written into fetched/working position
 * data; they are applied at health-factor recompute time, so clearing an
 * override always restores the on-chain values.
 *
 * All LTV / liquidation-threshold values are basis points (e.g. 8250 = 82.5%),
 * matching on-chain units. Caps are whole-token amounts (0 = no cap).
 */

export type AssetRiskOverride = {
  /** basis points */
  ltv?: number;
  /** basis points */
  liquidationThreshold?: number;
  /** legacy per-asset eMode LTV, basis points */
  eModeLtv?: number;
  /** legacy per-asset eMode liquidation threshold, basis points */
  eModeLiquidationThreshold?: number;
  /** whole tokens, 0 = uncapped */
  supplyCap?: number;
  /** whole tokens, 0 = uncapped */
  borrowCap?: number;
  borrowingEnabled?: boolean;
  usageAsCollateralEnabled?: boolean;
  isFrozen?: boolean;
  isPaused?: boolean;
};

export type EModeCategoryOverride = {
  /** basis points */
  ltv?: number;
  /** basis points */
  liquidationThreshold?: number;
};

export type RiskParamOverrides = {
  v: 1;
  /** keyed by asset symbol */
  assets: Record<string, AssetRiskOverride>;
  /** keyed by eMode category id */
  eModeCategories?: Record<string, EModeCategoryOverride>;
  meta?: {
    /** short human label, e.g. "Gauntlet 2026-08 param update" */
    label?: string;
    /** reference url, e.g. an Aave governance forum post */
    ref?: string;
  };
};

/** A decoded shareable config: overrides pinned to a specific market. */
export type SharedRiskConfig = {
  marketId: string;
  overrides: RiskParamOverrides;
};

export const createEmptyRiskOverrides = (): RiskParamOverrides => ({
  v: 1,
  assets: {},
});

const NUMERIC_ASSET_FIELDS = [
  "ltv",
  "liquidationThreshold",
  "eModeLtv",
  "eModeLiquidationThreshold",
  "supplyCap",
  "borrowCap",
] as const;

const BOOLEAN_ASSET_FIELDS = [
  "borrowingEnabled",
  "usageAsCollateralEnabled",
  "isFrozen",
  "isPaused",
] as const;

const BPS_FIELDS: ReadonlySet<string> = new Set([
  "ltv",
  "liquidationThreshold",
  "eModeLtv",
  "eModeLiquidationThreshold",
]);

const MAX_BPS = 10000;

const sanitizeNumber = (field: string, value: unknown): number | undefined => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  if (BPS_FIELDS.has(field)) return Math.min(Math.round(num), MAX_BPS);
  return num;
};

const sanitizeAssetOverride = (
  raw: unknown
): AssetRiskOverride | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const clean: AssetRiskOverride = {};

  NUMERIC_ASSET_FIELDS.forEach((field) => {
    if (source[field] === undefined || source[field] === null) return;
    const value = sanitizeNumber(field, source[field]);
    if (value !== undefined) clean[field] = value;
  });

  BOOLEAN_ASSET_FIELDS.forEach((field) => {
    if (typeof source[field] === "boolean") clean[field] = source[field] as boolean;
  });

  // Aave invariant: liquidation threshold >= LTV. When both are overridden,
  // cap the LTV at the LT rather than producing an impossible pair.
  if (
    clean.ltv !== undefined &&
    clean.liquidationThreshold !== undefined &&
    clean.ltv > clean.liquidationThreshold
  ) {
    clean.ltv = clean.liquidationThreshold;
  }
  if (
    clean.eModeLtv !== undefined &&
    clean.eModeLiquidationThreshold !== undefined &&
    clean.eModeLtv > clean.eModeLiquidationThreshold
  ) {
    clean.eModeLtv = clean.eModeLiquidationThreshold;
  }

  return Object.keys(clean).length ? clean : undefined;
};

const sanitizeEModeCategoryOverride = (
  raw: unknown
): EModeCategoryOverride | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const clean: EModeCategoryOverride = {};
  (["ltv", "liquidationThreshold"] as const).forEach((field) => {
    if (source[field] === undefined || source[field] === null) return;
    const value = sanitizeNumber(field, source[field]);
    if (value !== undefined) clean[field] = value;
  });
  if (
    clean.ltv !== undefined &&
    clean.liquidationThreshold !== undefined &&
    clean.ltv > clean.liquidationThreshold
  ) {
    clean.ltv = clean.liquidationThreshold;
  }
  return Object.keys(clean).length ? clean : undefined;
};

/**
 * Defensively validate/clamp an override object (e.g. decoded from a URL).
 * Unknown fields are dropped, numbers are clamped to sane ranges, and empty
 * structures are pruned.
 */
export const sanitizeRiskOverrides = (raw: unknown): RiskParamOverrides => {
  const clean = createEmptyRiskOverrides();
  if (!raw || typeof raw !== "object") return clean;
  const source = raw as Record<string, unknown>;

  const assets = source.assets;
  if (assets && typeof assets === "object") {
    Object.entries(assets as Record<string, unknown>).forEach(
      ([symbol, override]) => {
        if (typeof symbol !== "string" || !symbol.length || symbol.length > 64)
          return;
        const cleanOverride = sanitizeAssetOverride(override);
        if (cleanOverride) clean.assets[symbol] = cleanOverride;
      }
    );
  }

  const categories = source.eModeCategories;
  if (categories && typeof categories === "object") {
    Object.entries(categories as Record<string, unknown>).forEach(
      ([id, override]) => {
        const numericId = Number(id);
        if (!Number.isInteger(numericId) || numericId < 0 || numericId > 255)
          return;
        const cleanOverride = sanitizeEModeCategoryOverride(override);
        if (cleanOverride) {
          if (!clean.eModeCategories) clean.eModeCategories = {};
          clean.eModeCategories[String(numericId)] = cleanOverride;
        }
      }
    );
  }

  const meta = source.meta;
  if (meta && typeof meta === "object") {
    const { label, ref } = meta as Record<string, unknown>;
    const cleanMeta: RiskParamOverrides["meta"] = {};
    if (typeof label === "string" && label.trim().length)
      cleanMeta.label = label.trim().slice(0, 140);
    if (typeof ref === "string" && /^https?:\/\//i.test(ref.trim()))
      cleanMeta.ref = ref.trim().slice(0, 500);
    if (Object.keys(cleanMeta).length) clean.meta = cleanMeta;
  }

  return clean;
};

export const hasAnyRiskOverrides = (
  overrides?: RiskParamOverrides | null
): boolean => {
  if (!overrides) return false;
  if (Object.keys(overrides.assets || {}).length) return true;
  if (Object.keys(overrides.eModeCategories || {}).length) return true;
  return false;
};

/**
 * Merge two override sets; fields from `priority` win over `base`.
 * Used to layer the user's manual edits on top of a shared URL config.
 */
export const mergeRiskOverrides = (
  base?: RiskParamOverrides | null,
  priority?: RiskParamOverrides | null
): RiskParamOverrides => {
  const merged = createEmptyRiskOverrides();

  [base, priority].forEach((source) => {
    if (!source) return;
    Object.entries(source.assets || {}).forEach(([symbol, override]) => {
      merged.assets[symbol] = { ...merged.assets[symbol], ...override };
    });
    Object.entries(source.eModeCategories || {}).forEach(([id, override]) => {
      if (!merged.eModeCategories) merged.eModeCategories = {};
      merged.eModeCategories[id] = {
        ...merged.eModeCategories[id],
        ...override,
      };
    });
    if (source.meta) merged.meta = { ...merged.meta, ...source.meta };
  });

  return merged;
};

/**
 * Return eMode categories with any category-level overrides applied.
 * Returns the original array when there is nothing to apply.
 */
export const applyEModeCategoryOverrides = (
  eModes: EModeCategoryData[] | undefined,
  overrides?: RiskParamOverrides | null
): EModeCategoryData[] | undefined => {
  const categoryOverrides = overrides?.eModeCategories;
  if (!eModes?.length || !categoryOverrides) return eModes;
  if (!Object.keys(categoryOverrides).length) return eModes;

  return eModes.map((category) => {
    const override = categoryOverrides[String(category.id)];
    if (!override) return category;
    return {
      ...category,
      ltv: override.ltv ?? category.ltv,
      liquidationThreshold:
        override.liquidationThreshold ?? category.liquidationThreshold,
    };
  });
};

/**
 * A minimal shape of AssetDetails that override application cares about.
 * (Kept structural to avoid a runtime import cycle with hooks/useAaveData.)
 */
type OverridableAssetFields = {
  symbol: string;
  baseLTVasCollateral: number;
  reserveLiquidationThreshold: number;
  eModeLtv?: number;
  eModeLiquidationThreshold?: number;
  supplyCap?: number;
  borrowCap?: number;
  borrowingEnabled?: boolean;
  usageAsCollateralEnabled: boolean;
  isFrozen?: boolean;
  isPaused?: boolean;
};

/**
 * Return a copy of the asset with override fields applied. Useful for
 * display and gating (e.g. the add-asset dialog); position math applies
 * overrides directly in updateDerivedHealthFactorData instead.
 */
export const applyRiskOverridesToAsset = <T extends OverridableAssetFields>(
  asset: T,
  overrides?: RiskParamOverrides | null
): T => {
  const override = overrides?.assets?.[asset.symbol];
  if (!override) return asset;
  return {
    ...asset,
    baseLTVasCollateral: override.ltv ?? asset.baseLTVasCollateral,
    reserveLiquidationThreshold:
      override.liquidationThreshold ?? asset.reserveLiquidationThreshold,
    eModeLtv: override.eModeLtv ?? asset.eModeLtv,
    eModeLiquidationThreshold:
      override.eModeLiquidationThreshold ?? asset.eModeLiquidationThreshold,
    supplyCap: override.supplyCap ?? asset.supplyCap,
    borrowCap: override.borrowCap ?? asset.borrowCap,
    borrowingEnabled: override.borrowingEnabled ?? asset.borrowingEnabled,
    usageAsCollateralEnabled:
      override.usageAsCollateralEnabled ?? asset.usageAsCollateralEnabled,
    isFrozen: override.isFrozen ?? asset.isFrozen,
    isPaused: override.isPaused ?? asset.isPaused,
  };
};

/** Flat list of individual overridden fields, for diff chips/banners. */
export type RiskOverrideEntry = {
  kind: "asset" | "eModeCategory";
  /** asset symbol or eMode category id */
  key: string;
  field: string;
  value: number | boolean;
};

export const flattenRiskOverrides = (
  overrides?: RiskParamOverrides | null
): RiskOverrideEntry[] => {
  if (!overrides) return [];
  const entries: RiskOverrideEntry[] = [];
  Object.entries(overrides.assets || {}).forEach(([symbol, override]) => {
    Object.entries(override).forEach(([field, value]) => {
      if (value === undefined) return;
      entries.push({ kind: "asset", key: symbol, field, value });
    });
  });
  Object.entries(overrides.eModeCategories || {}).forEach(([id, override]) => {
    Object.entries(override).forEach(([field, value]) => {
      if (value === undefined) return;
      entries.push({ kind: "eModeCategory", key: id, field, value });
    });
  });
  return entries;
};

/**
 *
 *  *** Shareable URL config encoding ***
 *
 * Compact, versioned, defensively-parsed format:
 * base64url(JSON) with single-letter field keys to keep URLs short.
 *
 */

const ASSET_FIELD_TO_COMPACT: Record<keyof AssetRiskOverride, string> = {
  ltv: "l",
  liquidationThreshold: "t",
  eModeLtv: "el",
  eModeLiquidationThreshold: "et",
  supplyCap: "sc",
  borrowCap: "bc",
  borrowingEnabled: "b",
  usageAsCollateralEnabled: "c",
  isFrozen: "f",
  isPaused: "p",
};

const COMPACT_TO_ASSET_FIELD: Record<string, keyof AssetRiskOverride> =
  Object.fromEntries(
    Object.entries(ASSET_FIELD_TO_COMPACT).map(([field, compact]) => [
      compact,
      field as keyof AssetRiskOverride,
    ])
  );

const toBase64Url = (value: string): string => {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(value, "utf8").toString("base64")
      : // UTF-8 encode via percent-escapes so btoa only sees byte values
      window.btoa(
        encodeURIComponent(value).replace(
          /%([0-9A-F]{2})/g,
          (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))
        )
      );
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string): string => {
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  const binary = window.atob(base64);
  return decodeURIComponent(
    binary
      .split("")
      .map(
        (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`
      )
      .join("")
  );
};

/** Encode a market-scoped override config into a URL-safe string. */
export const encodeRiskConfig = (config: SharedRiskConfig): string => {
  const compact: Record<string, unknown> = {
    v: 1,
    m: config.marketId,
  };

  const assets: Record<string, Record<string, number | boolean>> = {};
  Object.entries(config.overrides.assets || {}).forEach(
    ([symbol, override]) => {
      const compactOverride: Record<string, number | boolean> = {};
      Object.entries(override).forEach(([field, value]) => {
        if (value === undefined) return;
        const key = ASSET_FIELD_TO_COMPACT[field as keyof AssetRiskOverride];
        if (key) compactOverride[key] = value;
      });
      if (Object.keys(compactOverride).length)
        assets[symbol] = compactOverride;
    }
  );
  if (Object.keys(assets).length) compact.a = assets;

  const categories: Record<string, Record<string, number>> = {};
  Object.entries(config.overrides.eModeCategories || {}).forEach(
    ([id, override]) => {
      const compactOverride: Record<string, number> = {};
      if (override.ltv !== undefined) compactOverride.l = override.ltv;
      if (override.liquidationThreshold !== undefined)
        compactOverride.t = override.liquidationThreshold;
      if (Object.keys(compactOverride).length)
        categories[id] = compactOverride;
    }
  );
  if (Object.keys(categories).length) compact.e = categories;

  if (config.overrides.meta?.label) compact.n = config.overrides.meta.label;
  if (config.overrides.meta?.ref) compact.r = config.overrides.meta.ref;

  return toBase64Url(JSON.stringify(compact));
};

/**
 * Decode and validate a shared config string. Returns null when the payload
 * is malformed or references an unknown market; individual invalid fields
 * are dropped rather than failing the whole config.
 */
export const decodeRiskConfig = (
  encoded: string,
  validMarketIds?: string[]
): SharedRiskConfig | null => {
  if (!encoded || typeof encoded !== "string" || encoded.length > 8192)
    return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const source = parsed as Record<string, unknown>;
  if (source.v !== 1) return null;

  const marketId = source.m;
  if (typeof marketId !== "string" || !marketId.length) return null;
  if (validMarketIds && !validMarketIds.includes(marketId)) return null;

  // Expand compact keys back to full field names, then run the standard
  // sanitizer so URL payloads get the same clamping as any other input.
  const rawOverrides: Record<string, unknown> = {};

  if (source.a && typeof source.a === "object") {
    const assets: Record<string, Record<string, unknown>> = {};
    Object.entries(source.a as Record<string, unknown>).forEach(
      ([symbol, compactOverride]) => {
        if (!compactOverride || typeof compactOverride !== "object") return;
        const expanded: Record<string, unknown> = {};
        Object.entries(compactOverride as Record<string, unknown>).forEach(
          ([compactKey, value]) => {
            const field = COMPACT_TO_ASSET_FIELD[compactKey];
            if (field) expanded[field] = value;
          }
        );
        assets[symbol] = expanded;
      }
    );
    rawOverrides.assets = assets;
  }

  if (source.e && typeof source.e === "object") {
    const categories: Record<string, Record<string, unknown>> = {};
    Object.entries(source.e as Record<string, unknown>).forEach(
      ([id, compactOverride]) => {
        if (!compactOverride || typeof compactOverride !== "object") return;
        const compact = compactOverride as Record<string, unknown>;
        categories[id] = {
          ltv: compact.l,
          liquidationThreshold: compact.t,
        };
      }
    );
    rawOverrides.eModeCategories = categories;
  }

  rawOverrides.meta = { label: source.n, ref: source.r };

  const overrides = sanitizeRiskOverrides(rawOverrides);
  if (!hasAnyRiskOverrides(overrides)) return null;

  return { marketId, overrides };
};
