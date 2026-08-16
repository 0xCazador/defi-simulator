import { BigNumber } from "ethers";
import { ethers } from "ethers";
import BigNumberJs from "bignumber.js";

import type { AccrualSide, LedgerEntry } from "./tokenEventAccrual";

/**
 * Accrued interest computed from Aave v4 Spoke events.
 *
 * v4 has no aTokens or debt tokens — positions are internal Spoke storage —
 * but the Spoke emits an event for every principal flow, each carrying both
 * the share delta and the asset amount:
 *
 *   - Supply(reserveId, caller, user, suppliedShares, suppliedAmount)
 *   - Withdraw(reserveId, caller, user, withdrawnShares, withdrawnAmount)
 *   - Borrow(reserveId, caller, user, drawnShares, drawnAmount)
 *   - Repay(reserveId, caller, user, drawnShares, totalAmountRepaid, premiumDelta)
 *   - LiquidationCall(...) adjusts both sides: collateralAmountRemoved leaves
 *     the supply position, debtAmountRestored leaves the debt position.
 *
 * Since every flow is one of these events, the same cash-flow identity the v3
 * feature uses is exact here:
 *
 *   accruedInterest = currentBalance - netPrincipal
 *   netPrincipal    = sum(inflow amounts) - sum(outflow amounts)
 *
 * where currentBalance is getUserSuppliedAssets / getUserTotalDebt (premium
 * debt included, so premium interest is part of the borrow-side total).
 *
 * Per-event realized interest has no v3 `balanceIncrease` equivalent, so it
 * is reconstructed from share prices: each event's asset/share ratio is the
 * share price at that moment, and interest realized between two events is
 * heldShares × (price now − price at previous event). On the borrow side a
 * Repay's totalAmountRepaid includes premium debt while its share count is
 * drawn-only, so for users with a non-zero risk premium the reconstructed
 * per-event split can overstate the repay-time interest — the lifetime total
 * from the identity above is unaffected.
 */

export type SpokeFlowEventKind =
  | "Supply"
  | "Withdraw"
  | "Borrow"
  | "Repay"
  | "CollateralLiquidated"
  | "DebtLiquidated";

export type SpokeFlowEvent = {
  kind: SpokeFlowEventKind;
  /** asset amount moved, in underlying base units */
  amount: string;
  /** supply or drawn shares minted/burned by the event */
  shares: string;
  blockNumber: number;
  logIndex: number;
  transactionHash?: string;
  /** unix seconds of the event's block, present once resolved */
  timestamp?: number;
};

const INFLOW_KINDS: SpokeFlowEventKind[] = ["Supply", "Borrow"];

/** The signed principal delta (base units) contributed by a single event */
export const getPrincipalFlowV4 = (event: SpokeFlowEvent): BigNumber => {
  const amount = BigNumber.from(event.amount);
  return INFLOW_KINDS.includes(event.kind) ? amount : amount.mul(-1);
};

export const getNetPrincipalV4 = (events: SpokeFlowEvent[]): BigNumber =>
  events.reduce(
    (sum, event) => sum.add(getPrincipalFlowV4(event)),
    BigNumber.from(0),
  );

/**
 * Total interest accrued by the position over its whole life, in base units.
 * For supply positions this is interest earned; for debt positions it is
 * interest owed (paid + currently outstanding), premium debt included.
 */
export const getAccruedInterestV4 = (
  currentBalanceRaw: string,
  events: SpokeFlowEvent[],
): BigNumber =>
  BigNumber.from(currentBalanceRaw).sub(getNetPrincipalV4(events));

const byChainOrder = (a: SpokeFlowEvent, b: SpokeFlowEvent) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

/** The earliest event that added principal to the position (for "since" display) */
export const findFirstPrincipalEventV4 = (
  events: SpokeFlowEvent[],
): SpokeFlowEvent | undefined =>
  [...events]
    .sort(byChainOrder)
    .find(
      (event) =>
        INFLOW_KINDS.includes(event.kind) && getPrincipalFlowV4(event).gt(0),
    );

/**
 * The chronological, classified accounting of every balance-changing event.
 * `interestRealized` is the interest accrued between the previous event and
 * this one, reconstructed from share-price movement (see module docs); rows
 * without usable share data (zero shares) realize zero.
 */
export const buildLedgerV4 = (events: SpokeFlowEvent[]): LedgerEntry[] => {
  // Share prices are tiny ratios of big integers; keep plenty of precision.
  const Precise = BigNumberJs.clone({ DECIMAL_PLACES: 40 });

  let heldShares = new Precise(0);
  let lastPrice: BigNumberJs | null = null;

  return [...events].sort(byChainOrder).map((event) => {
    const shares = new Precise(event.shares);
    const amount = new Precise(event.amount);
    const price =
      shares.gt(0) && amount.gt(0) ? amount.dividedBy(shares) : null;

    let interestRealized = new Precise(0);
    if (price && lastPrice && heldShares.gt(0)) {
      const delta = heldShares.multipliedBy(price.minus(lastPrice));
      // Share prices are monotonic per side; a negative delta means the two
      // prices came from differently composed events (e.g. premium-bearing
      // repays), so treat it as no realized interest rather than negative.
      if (delta.gt(0)) interestRealized = delta;
    }

    heldShares = INFLOW_KINDS.includes(event.kind)
      ? heldShares.plus(shares)
      : BigNumberJs.max(heldShares.minus(shares), 0);
    if (price) lastPrice = price;

    const action =
      event.kind === "CollateralLiquidated" || event.kind === "DebtLiquidated"
        ? "Liquidation"
        : event.kind;

    return {
      action,
      principalDelta: getPrincipalFlowV4(event).toString(),
      interestRealized: interestRealized.toFixed(0, BigNumberJs.ROUND_DOWN),
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      transactionHash: event.transactionHash,
      timestamp: event.timestamp,
    };
  });
};

/** Interest realized at past events (share-price reconstruction), base units */
export const getRealizedInterestV4 = (events: SpokeFlowEvent[]): BigNumber =>
  buildLedgerV4(events).reduce(
    (sum, entry) => sum.add(BigNumber.from(entry.interestRealized)),
    BigNumber.from(0),
  );

/**
 * Synthetic position refs: the accrual hooks, caches and UI identify a
 * position by its aToken / debt-token contract address, which v4 doesn't
 * have. Each v4 (reserveId, side) pair is instead given a synthetic
 * address-shaped ref — a recognizable prefix byte plus the reserveId — that
 * tunnels through the existing tokenAddress plumbing unchanged. The accrual
 * API decodes the reserveId back out for v4 markets.
 */
const V4_SUPPLY_PREFIX = "0xaa";
const V4_BORROW_PREFIX = "0xbb";

export const encodeV4PositionRef = (
  reserveId: number,
  side: AccrualSide,
): string =>
  ethers.utils.getAddress(
    ethers.utils.hexConcat([
      side === "supply" ? V4_SUPPLY_PREFIX : V4_BORROW_PREFIX,
      ethers.utils.hexZeroPad(ethers.utils.hexlify(reserveId), 19),
    ]),
  );

export const decodeV4PositionRef = (ref: string): number =>
  // strip "0x" plus the one-byte side prefix; the rest is the reserveId
  parseInt(ref.slice(4), 16);
