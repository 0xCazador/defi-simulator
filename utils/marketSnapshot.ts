/**
 * Reserve-parameter snapshot for the server-rendered marketing sections.
 *
 * Caching is the whole difficulty here. Every indexable route is prerendered
 * once per locale, so there are 124 pages (2 routes x 62 locales) each
 * revalidating on its own timer against ~20 markets. Uncached, one revalidate
 * window could fan out into thousands of RPC calls, so there are two tiers:
 *
 *   1. A module-scope memo, which collapses all 124 getStaticProps calls in a
 *      single build (or a single warm lambda) into one fetch round.
 *   2. A Netlify Blobs entry, so pages regenerating on *different* instances
 *      reuse one snapshot instead of each paying for their own.
 *
 * Nothing here is allowed to throw: a market that fails is dropped, and a
 * total failure returns null so the page still renders its copy without the
 * tables. Reserve data is a nice-to-have on these pages, never a build blocker.
 */
import { promises as fs } from "fs";
import path from "path";

import {
  MarketReserveStat,
  getMarketReserveStats,
} from "../pages/api/aave/index";
import { AaveMarketDataType, markets } from "../hooks/useAaveData";
import { REVALIDATE_SECONDS } from "./seo";

export type MarketSnapshotEntry = {
  id: string;
  title: string;
  version: "v3" | "v4";
  assets: MarketReserveStat[];
};

export type MarketSnapshot = {
  /** unix seconds; surfaced in the UI as "rates as of …" */
  generatedAt: number;
  markets: MarketSnapshotEntry[];
};

/** Deliberately the pages' own revalidate window: a regenerating page normally
 * finds a warm blob, and only the first one past the window refetches. */
const TTL_SECONDS = REVALIDATE_SECONDS;

/** Assets per market, ranked by liquidity. The cap is about page weight: this
 * snapshot ships inside __NEXT_DATA__ on every page load. */
const ASSETS_PER_MARKET = 6;

/** Concurrent market fetches. Deliberately low — 20 markets hitting the same
 * RPC provider at once invites rate limiting during a build. */
const FETCH_CONCURRENCY = 4;

const STORE_NAME = "seo";
const SNAPSHOT_KEY = "market-snapshot-v1";

const LOCAL_DIR = path.join(
  process.cwd(),
  ".netlify",
  "blobs-local",
  STORE_NAME,
);
const LOCAL_FILE = path.join(LOCAL_DIR, `${SNAPSHOT_KEY}.json`);

let memo: MarketSnapshot | null = null;

const nowSeconds = () => Math.floor(Date.now() / 1000);

const isFresh = (snapshot: MarketSnapshot | null): snapshot is MarketSnapshot =>
  !!snapshot && nowSeconds() - snapshot.generatedAt < TTL_SECONDS;

/** Dynamic import keeps the ESM-only SDK out of Jest's module graph, and
 * returns null when there's no Netlify context (plain `next build`, local dev). */
const getBlobStore = async () => {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
};

const readCachedSnapshot = async (): Promise<MarketSnapshot | null> => {
  try {
    const store = await getBlobStore();
    if (store) return (await store.get(SNAPSHOT_KEY, { type: "json" })) ?? null;
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeCachedSnapshot = async (snapshot: MarketSnapshot): Promise<void> => {
  try {
    const store = await getBlobStore();
    if (store) {
      await store.setJSON(SNAPSHOT_KEY, snapshot);
      return;
    }
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(LOCAL_FILE, JSON.stringify(snapshot));
  } catch {
    // A cache write failure only costs a refetch next time.
  }
};

/** Four significant-ish decimals is plenty for display and meaningfully
 * shrinks the JSON that ships in every page's __NEXT_DATA__. */
const round = (value: number, places = 4): number => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const trimAssets = (assets: MarketReserveStat[]): MarketReserveStat[] =>
  [...assets]
    .sort((a, b) => b.totalLiquidityUSD - a.totalLiquidityUSD)
    .slice(0, ASSETS_PER_MARKET)
    .map((asset) => ({
      symbol: asset.symbol,
      ltv: round(asset.ltv),
      liquidationThreshold: round(asset.liquidationThreshold),
      liquidationPenalty: round(asset.liquidationPenalty),
      supplyAPY: round(asset.supplyAPY),
      variableBorrowAPY: round(asset.variableBorrowAPY),
      totalLiquidityUSD: Math.round(asset.totalLiquidityUSD),
      borrowingEnabled: asset.borrowingEnabled,
      usageAsCollateralEnabled: asset.usageAsCollateralEnabled,
    }));

const fetchMarketEntry = async (
  market: AaveMarketDataType,
): Promise<MarketSnapshotEntry | null> => {
  try {
    const assets = await getMarketReserveStats(market);
    if (!assets.length) return null;
    return {
      id: market.id,
      title: market.title,
      version: market.v4 ? "v4" : "v3",
      assets: trimAssets(assets),
    };
  } catch (err) {
    console.error(`Market snapshot: skipping ${market.id}`, err);
    return null;
  }
};

const buildSnapshot = async (): Promise<MarketSnapshot | null> => {
  const entries: MarketSnapshotEntry[] = [];
  for (let i = 0; i < markets.length; i += FETCH_CONCURRENCY) {
    const batch = markets.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map(fetchMarketEntry));
    results.forEach((entry) => {
      if (entry) entries.push(entry);
    });
  }
  if (!entries.length) return null;
  return { generatedAt: nowSeconds(), markets: entries };
};

/**
 * The snapshot, from the warmest available source. Returns null only when
 * there is no cached copy and every market fetch failed.
 */
export const getMarketSnapshot = async (): Promise<MarketSnapshot | null> => {
  if (isFresh(memo)) return memo;

  const cached = await readCachedSnapshot();
  if (isFresh(cached)) {
    memo = cached;
    return memo;
  }

  const built = await buildSnapshot();
  if (built) {
    memo = built;
    await writeCachedSnapshot(built);
    return built;
  }

  // Stale beats nothing: month-old LTVs still describe the protocol far better
  // than an empty table, and the copy around them stays accurate.
  if (cached) {
    memo = cached;
    return cached;
  }
  return null;
};

/** Test seam: drops the in-process memo. */
export const resetMarketSnapshotMemo = () => {
  memo = null;
};
