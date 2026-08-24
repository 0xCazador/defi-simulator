/**
 * USD floor for a fetched supply or borrow to enter the simulator.
 *
 * Leftover dust (aToken rounding, abandoned rewards, tiny leftovers after
 * withdraw/repay) otherwise shows up as its own row, gets an interest-history
 * scan, and nudges health-factor math by a fraction of a cent. Simulated
 * edits are not subject to this floor: a user who adds an asset or drags a
 * quantity below $1 should still see the row.
 *
 * Dust is dropped only when hiding it would still leave at least one supply
 * (or, separately, at least one borrow). A wallet whose entire supply or
 * borrow side is under $1 keeps those rows so the position does not look empty.
 */
export const MIN_FETCHED_POSITION_USD = 1;

/** True when `usd` is a finite number at or above {@link MIN_FETCHED_POSITION_USD}. */
export const isMeaningfulFetchedPositionUsd = (usd: unknown): boolean => {
  const value = typeof usd === "number" ? usd : Number(usd);
  return Number.isFinite(value) && value >= MIN_FETCHED_POSITION_USD;
};

type FetchedSupply = {
  underlyingBalance?: unknown;
  underlyingBalanceUSD?: unknown;
};

type FetchedBorrow = {
  totalBorrows?: unknown;
  totalBorrowsUSD?: unknown;
};

const hasPositiveAmount = (amount: unknown): boolean => {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(value) && value > 0;
};

/** Keep on-chain supplies that both have a balance and are worth at least $1. */
export const isMeaningfulFetchedSupply = (item: FetchedSupply): boolean =>
  hasPositiveAmount(item.underlyingBalance) &&
  isMeaningfulFetchedPositionUsd(item.underlyingBalanceUSD);

/** Keep on-chain borrows that both have debt and are worth at least $1. */
export const isMeaningfulFetchedBorrow = (item: FetchedBorrow): boolean =>
  hasPositiveAmount(item.totalBorrows) &&
  isMeaningfulFetchedPositionUsd(item.totalBorrowsUSD);

const keepHeldOrMeaningful = <T>(
  items: readonly T[],
  isHeld: (item: T) => boolean,
  isMeaningful: (item: T) => boolean,
): T[] => {
  const held = items.filter(isHeld);
  const meaningful = held.filter(isMeaningful);
  return meaningful.length > 0 ? meaningful : held;
};

/** Drop sub-$1 supplies when another supply is worth at least $1. */
export const filterFetchedSupplies = <T extends FetchedSupply>(
  items: readonly T[] | undefined | null,
): T[] =>
  keepHeldOrMeaningful(
    items ?? [],
    (item) => hasPositiveAmount(item.underlyingBalance),
    isMeaningfulFetchedSupply,
  );

/** Drop sub-$1 borrows when another borrow is worth at least $1. */
export const filterFetchedBorrows = <T extends FetchedBorrow>(
  items: readonly T[] | undefined | null,
): T[] =>
  keepHeldOrMeaningful(
    items ?? [],
    (item) => hasPositiveAmount(item.totalBorrows),
    isMeaningfulFetchedBorrow,
  );
