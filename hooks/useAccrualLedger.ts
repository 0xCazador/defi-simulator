import { useCallback, useEffect, useReducer, useState } from "react";

import {
  AccrualResponse,
  AccrualSide,
  ManifestAssetRef,
  ManifestScanItem,
  getAccrualData,
  getAccrualManifest,
} from "../pages/api/aave/accrual";
import { markets } from "./useAaveData";

export type AccrualLedgerState = {
  isFetching: boolean;
  fetchError: string;
  /** full accrual data including the chronological event ledger */
  data?: AccrualResponse;
};

const PENDING: AccrualLedgerState = { isFetching: true, fetchError: "" };

// results are immutable for a given (market, token, user) within a session,
// so cache them to avoid refetching when navigating around
const ledgerCache = new Map<string, AccrualLedgerState>();

const ledgerCacheKey = (
  marketId: string | undefined,
  tokenAddress: string | undefined,
  user: string | undefined,
  side: AccrualSide
) => `${marketId}:${tokenAddress}:${user}:${side}`.toLowerCase();

/** Identifies one position (token + side) within a market/user's ledger set */
export const getPositionKey = (tokenAddress: string, side: AccrualSide) =>
  `${tokenAddress}:${side}`.toLowerCase();

export type LedgerRequest = {
  tokenAddress: string;
  side: AccrualSide;
};

// In-flight fetches keyed the same way as the cache. Without this, a component
// that mounts while a fetch is running would see a pending cache entry, skip
// starting its own fetch, and never learn when that fetch settled.
const inFlight = new Map<string, Promise<void>>();

/**
 * Fetch the full interest accrual ledger (every classified, dated event) for a
 * set of positions. Returns a map keyed by `getPositionKey`.
 *
 * The whole set is fetched together rather than per-section so the page can
 * total the interest across positions before any section is expanded.
 */
export function useAccrualLedgers(
  marketId: string | undefined,
  user: string | undefined,
  requests: LedgerRequest[]
): Map<string, AccrualLedgerState> {
  const [, bumpVersion] = useReducer((version: number) => version + 1, 0);
  const isReady: boolean = !!marketId?.length && !!user?.length;

  // Re-run only when the actual set of positions changes, not on every render.
  const signature = requests
    .map((request) => getPositionKey(request.tokenAddress, request.side))
    .sort()
    .join("|");

  useEffect(() => {
    if (!isReady) return undefined;
    const market = markets.find((m) => m.id === marketId);
    if (!market) return undefined;

    let cancelled = false;
    const onSettled = () => {
      if (!cancelled) bumpVersion();
    };

    requests.forEach((request) => {
      const key = ledgerCacheKey(
        marketId,
        request.tokenAddress,
        user,
        request.side
      );

      const existing = inFlight.get(key);
      if (existing) {
        existing.then(onSettled);
        return;
      }
      if (ledgerCache.has(key)) return;

      ledgerCache.set(key, PENDING);
      // Fetched directly from the browser (like getAaveData) so RPC requests
      // carry the page origin; keyed RPC providers may allowlist origins and
      // reject server-side requests that have none.
      const fetch = getAccrualData(
        market,
        user!,
        request.tokenAddress,
        request.side,
        true
      )
        .then((data) => {
          ledgerCache.set(key, { isFetching: false, fetchError: "", data });
        })
        .catch((err: any) => {
          ledgerCache.set(key, {
            isFetching: false,
            fetchError: err?.message ?? "Failed to fetch",
          });
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, fetch);
      fetch.then(onSettled);
    });

    return () => {
      cancelled = true;
    };
  }, [signature, isReady]);

  const states = new Map<string, AccrualLedgerState>();
  requests.forEach((request) => {
    const cached = isReady
      ? ledgerCache.get(
          ledgerCacheKey(marketId, request.tokenAddress, user, request.side)
        )
      : undefined;
    states.set(
      getPositionKey(request.tokenAddress, request.side),
      cached ?? PENDING
    );
  });
  return states;
}

export type ManifestScanState = {
  isScanning: boolean;
  scanError: string;
  progress: { done: number; total: number };
  /** all scanned (token, side) results; present once a scan has completed */
  results?: ManifestScanItem[];
};

const IDLE: ManifestScanState = {
  isScanning: false,
  scanError: "",
  progress: { done: 0, total: 0 },
};

// one full-history scan result per (market, user) within a session
const manifestCache = new Map<string, ManifestScanState>();

/**
 * On-demand full-history scan across all reserves of a market: finds every
 * asset (including long-closed positions) where this user ever accrued
 * interest, on the supply or variable-borrow side.
 */
export function useAccrualManifest(
  marketId: string | undefined,
  user: string | undefined
) {
  const key = `${marketId}:${user}`.toLowerCase();
  const [state, setState] = useState<ManifestScanState>(
    manifestCache.get(key) ?? IDLE
  );

  useEffect(() => {
    setState(manifestCache.get(key) ?? IDLE);
  }, [key]);

  const startScan = useCallback(
    (assets: ManifestAssetRef[]) => {
      if (!marketId?.length || !user?.length) return;
      const existing = manifestCache.get(key);
      if (existing?.isScanning || existing?.results) return;

      const market = markets.find((m) => m.id === marketId);
      if (!market) return;

      const update = (next: ManifestScanState) => {
        manifestCache.set(key, next);
        setState(next);
      };

      update({ ...IDLE, isScanning: true });

      const scan = async () => {
        try {
          const results = await getAccrualManifest(
            market,
            user,
            assets,
            (done, total) =>
              update({
                isScanning: true,
                scanError: "",
                progress: { done, total },
                results: undefined,
              })
          );
          // seed the per-position ledger cache so asset sections render
          // scan results without refetching
          results.forEach((item) => {
            if (!item.data) return;
            ledgerCache.set(
              ledgerCacheKey(marketId, item.tokenAddress, user, item.side),
              { isFetching: false, fetchError: "", data: item.data }
            );
          });
          update({
            isScanning: false,
            scanError: "",
            progress: { done: results.length, total: results.length },
            results,
          });
        } catch (err: any) {
          update({ ...IDLE, scanError: err?.message ?? "Scan failed" });
        }
      };

      scan();
    },
    [key, marketId, user]
  );

  return { ...state, startScan };
}
