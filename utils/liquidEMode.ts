import { ethers } from "ethers";

/**
 * Aave v3.2+ liquid eModes: category LTV/LT live on the eMode itself, and
 * each category has collateral/borrowable bitmaps keyed by reserve id.
 * Legacy per-reserve `eModeCategoryId` only reflects one (often stale) category
 * and is 0 for most assets that participate only via bitmaps.
 */

export type EModeCategoryData = {
  id: number;
  label: string;
  /** basis points, e.g. 9300 = 93% */
  ltv: number;
  /** basis points */
  liquidationThreshold: number;
  collateralBitmap: string;
  borrowableBitmap: string;
};

const POOL_ABI = [
  "function getEModeCategoryCollateralConfig(uint8 id) view returns (uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus)",
  "function getEModeCategoryLabel(uint8 id) view returns (string)",
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
  "function getEModeCategoryBorrowableBitmap(uint8 id) view returns (uint128)",
  "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
];

const PROVIDER_ABI = ["function getPool() view returns (address)"];

export const isReserveInBitmap = (bitmap: string, reserveId: number): boolean =>
  (BigInt(bitmap) & (1n << BigInt(reserveId))) !== 0n;

/** How many category ids to probe concurrently when scanning for eModes. */
export const EMODE_SCAN_BATCH_SIZE = 8;

/** Stop scanning for categories after this many consecutive empty slots. */
const MAX_CONSECUTIVE_MISSES = 3;

/** Fetch all configured liquid eMode categories from an Aave v3 Pool. */
export const fetchEModeCategories = async (
  provider: ethers.providers.Provider,
  poolAddress: string
): Promise<EModeCategoryData[]> => {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const categories: EModeCategoryData[] = [];

  // Categories are dense from 1 with small gaps; stop after a few empty
  // slots. Probe ids in parallel batches instead of one round-trip per id —
  // a pool with N categories costs ~ceil(N / batch) round-trips instead of N.
  let misses = 0;
  for (
    let start = 1;
    start < 256 && misses < MAX_CONSECUTIVE_MISSES;
    start += EMODE_SCAN_BATCH_SIZE
  ) {
    const ids: number[] = [];
    for (let id = start; id < Math.min(start + EMODE_SCAN_BATCH_SIZE, 256); id++) {
      ids.push(id);
    }

    const configs = await Promise.all(
      ids.map((id) => pool.getEModeCategoryCollateralConfig(id).catch(() => null))
    );

    const hits: { id: number; cfg: any }[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const cfg = configs[i];
      if (!cfg || Number(cfg.liquidationThreshold) === 0) {
        misses += 1;
        if (misses >= MAX_CONSECUTIVE_MISSES) break;
      } else {
        misses = 0;
        hits.push({ id: ids[i], cfg });
      }
    }

    const details = await Promise.all(
      hits.map(async ({ id, cfg }) => {
        try {
          const [label, collateralBitmap, borrowableBitmap] = await Promise.all([
            pool.getEModeCategoryLabel(id).catch(() => ""),
            pool.getEModeCategoryCollateralBitmap(id),
            pool.getEModeCategoryBorrowableBitmap(id),
          ]);
          const category: EModeCategoryData = {
            id,
            label: String(label || ""),
            ltv: Number(cfg.ltv),
            liquidationThreshold: Number(cfg.liquidationThreshold),
            collateralBitmap: collateralBitmap.toString(),
            borrowableBitmap: borrowableBitmap.toString(),
          };
          return category;
        } catch {
          return null;
        }
      })
    );
    categories.push(
      ...details.filter((c): c is EModeCategoryData => c !== null)
    );
  }
  return categories;
};

/** Resolve the Pool address from a PoolAddressesProvider. */
export const fetchPoolAddress = async (
  provider: ethers.providers.Provider,
  poolAddressesProvider: string
): Promise<string> => {
  const pap = new ethers.Contract(poolAddressesProvider, PROVIDER_ABI, provider);
  return pap.getPool();
};

/** Map underlying asset → reserve id (bitmap index) for the given assets. */
export const fetchReserveIds = async (
  provider: ethers.providers.Provider,
  poolAddress: string,
  underlyingAssets: string[]
): Promise<Map<string, number>> => {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const unique = [...new Set(underlyingAssets.map((a) => a.toLowerCase()))];
  const entries = await Promise.all(
    unique.map(async (asset) => {
      try {
        const data = await pool.getReserveData(asset);
        return [asset, Number(data.id)] as const;
      } catch {
        return [asset, -1] as const;
      }
    })
  );
  return new Map(entries.filter(([, id]) => id >= 0));
};

/**
 * On-chain labels for newer governance-created categories are raw
 * underscore-formatted strings like "rsETH__ETH_wstETH_ETHx" ("__" separates
 * the collateral side from the borrowable side, "_" separates words/tokens).
 * Beautify for display and cap the length.
 */
export const formatEModeLabel = (label?: string, maxLength = 32): string => {
  if (!label) return "";
  const pretty = label
    .split("__")
    .map((side) => side.split("_").filter(Boolean).join(" "))
    .join(" / ")
    .replace(/\s+/g, " ")
    .trim();
  if (pretty.length <= maxLength) return pretty;
  return `${pretty.slice(0, maxLength - 1).trimEnd()}…`;
};

export type RiskParams = {
  /** basis points */
  ltv: number;
  /** basis points */
  liquidationThreshold: number;
  isEMode: boolean;
};

/**
 * Effective LTV / LT for an asset under the user's active eMode.
 * Prefers liquid-eMode bitmaps; falls back to legacy per-reserve eMode fields.
 */
export const resolveEffectiveRiskParams = (args: {
  userEmodeCategoryId?: number;
  eModes?: EModeCategoryData[];
  reserveId?: number;
  baseLtv: number;
  baseLiquidationThreshold: number;
  /** legacy single-category id still returned by older UiPool providers */
  legacyEModeCategoryId?: number;
  legacyEModeLtv?: number;
  legacyEModeLiquidationThreshold?: number;
}): RiskParams => {
  const {
    userEmodeCategoryId,
    eModes,
    reserveId,
    baseLtv,
    baseLiquidationThreshold,
    legacyEModeCategoryId,
    legacyEModeLtv,
    legacyEModeLiquidationThreshold,
  } = args;

  if (userEmodeCategoryId && eModes?.length && reserveId !== undefined && reserveId >= 0) {
    const cat = eModes.find((e) => e.id === userEmodeCategoryId);
    if (cat && isReserveInBitmap(cat.collateralBitmap, reserveId)) {
      return {
        ltv: cat.ltv,
        liquidationThreshold: cat.liquidationThreshold,
        isEMode: true,
      };
    }
    // In an eMode but this asset is not collateral in it → base params
    return { ltv: baseLtv, liquidationThreshold: baseLiquidationThreshold, isEMode: false };
  }

  // Legacy fallback (pre-liquid eModes / missing bitmap data)
  if (
    userEmodeCategoryId &&
    legacyEModeCategoryId &&
    legacyEModeCategoryId === userEmodeCategoryId
  ) {
    return {
      ltv: legacyEModeLtv || baseLtv,
      liquidationThreshold: legacyEModeLiquidationThreshold || baseLiquidationThreshold,
      isEMode: true,
    };
  }

  return { ltv: baseLtv, liquidationThreshold: baseLiquidationThreshold, isEMode: false };
};
