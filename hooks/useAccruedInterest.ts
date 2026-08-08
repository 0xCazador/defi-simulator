import { useEffect, useState } from "react";

import { AccrualSide, getAccrualData } from "../pages/api/aave/accrual";
import { markets } from "./useAaveData";

export type AccruedInterestState = {
  isFetching: boolean;
  fetchError: string;
  /** accrued interest in human-readable token units */
  accruedValue?: string;
  /** unix seconds of the first principal-adding event */
  sinceTimestamp?: number | null;
};

const PENDING: AccruedInterestState = { isFetching: true, fetchError: "" };

// results are immutable for a given (market, token, user) within a session,
// so cache them to avoid refetching when dialogs are re-opened
const cache = new Map<string, AccruedInterestState>();

/** Fetch total accrued interest for one position from on-chain token events */
export function useAccruedInterest(
  marketId: string | undefined,
  user: string | undefined,
  tokenAddress: string | undefined,
  side: AccrualSide
) {
  const isReady: boolean =
    !!marketId?.length && !!user?.length && !!tokenAddress?.length;
  const key = `${marketId}:${tokenAddress}:${user}:${side}`.toLowerCase();
  const [state, setState] = useState<AccruedInterestState>(
    cache.get(key) ?? PENDING
  );

  useEffect(() => {
    if (!isReady) return undefined;

    const cached = cache.get(key);
    if (cached) {
      setState(cached);
      if (cached.isFetching === false) return undefined;
    }
    if (cached?.isFetching) return undefined; // another component instance is already fetching

    let cancelled = false;
    cache.set(key, PENDING);
    setState(PENDING);

    const fetchData = async () => {
      let next: AccruedInterestState;
      try {
        // Fetched directly from the browser (like getAaveData) so RPC requests
        // carry the page origin; keyed RPC providers may allowlist origins and
        // reject server-side requests that have none.
        const market = markets.find((m) => m.id === marketId);
        if (!market) throw new Error(`Unknown market: ${marketId}`);
        const data = await getAccrualData(market, user!, tokenAddress!, side);
        next = {
          isFetching: false,
          fetchError: "",
          accruedValue: data.accruedValue,
          sinceTimestamp: data.sinceTimestamp,
        };
      } catch (err: any) {
        next = {
          isFetching: false,
          fetchError: err?.message ?? "Failed to fetch",
        };
      }
      cache.set(key, next);
      if (!cancelled) setState(next);
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [key, isReady]);

  return isReady ? state : PENDING;
}
