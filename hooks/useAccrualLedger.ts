import { useCallback, useEffect, useState } from "react";

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

/**
 * Fetch the full interest accrual ledger (every classified, dated event) for
 * one position from on-chain token events. Same cache pattern as
 * useAccruedInterest, but includes per-event detail.
 */
export function useAccrualLedger(
  marketId: string | undefined,
  user: string | undefined,
  tokenAddress: string | undefined,
  side: AccrualSide
) {
  const isReady: boolean =
    !!marketId?.length && !!user?.length && !!tokenAddress?.length;
  const key = ledgerCacheKey(marketId, tokenAddress, user, side);
  const [state, setState] = useState<AccrualLedgerState>(
    ledgerCache.get(key) ?? PENDING
  );

  useEffect(() => {
    if (!isReady) return;

    const cached = ledgerCache.get(key);
    if (cached) {
      setState(cached);
      if (cached.isFetching === false) return;
    }
    if (cached?.isFetching) return; // another component instance is already fetching

    let cancelled = false;
    ledgerCache.set(key, PENDING);
    setState(PENDING);

    const fetchData = async () => {
      let next: AccrualLedgerState;
      try {
        // Fetched directly from the browser (like getAaveData) so RPC requests
        // carry the page origin; keyed RPC providers may allowlist origins and
        // reject server-side requests that have none.
        const market = markets.find((m) => m.id === marketId);
        if (!market) throw new Error(`Unknown market: ${marketId}`);
        const data = await getAccrualData(
          market,
          user!,
          tokenAddress!,
          side,
          true
        );
        next = { isFetching: false, fetchError: "", data };
      } catch (err: any) {
        next = {
          isFetching: false,
          fetchError: err?.message ?? "Failed to fetch",
        };
      }
      ledgerCache.set(key, next);
      if (!cancelled) setState(next);
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [key, isReady]);

  return isReady ? state : PENDING;
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
