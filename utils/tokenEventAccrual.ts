import { BigNumber } from "ethers";

/**
 * Accrued interest computed from aToken / variable debt token events.
 *
 * Aave v3 interest-bearing tokens emit an event for every balance change:
 *
 *   - Mint(caller, onBehalfOf, value, balanceIncrease, index)
 *     value = principal added + balanceIncrease (interest accrued since the user's
 *     previous index update). A withdrawal smaller than the accrued interest also
 *     emits a Mint (with value = balanceIncrease - amount withdrawn).
 *   - Burn(from, target, value, balanceIncrease, index)
 *     value = principal removed - balanceIncrease.
 *   - Transfer(from, to, value) between users, in underlying units at transfer time.
 *
 * Because *every* flow (supply, withdraw, borrow, repay, repay-with-aTokens,
 * collateral switch, liquidation seizure, plain aToken transfer) is one of these
 * events, the cash-flow identity below is exact:
 *
 *   accruedInterest = currentBalance - netPrincipal
 *   netPrincipal    = sum(Mint: value - balanceIncrease)
 *                   - sum(Burn: value + balanceIncrease)
 *                   + sum(TransferIn: value) - sum(TransferOut: value)
 */

export type TokenFlowEventKind = "Mint" | "Burn" | "TransferIn" | "TransferOut";

export type TokenFlowEvent = {
    kind: TokenFlowEventKind;
    /** the event's `value` in underlying token base units */
    value: string;
    /** interest accrued since the user's previous index update; Mint/Burn only */
    balanceIncrease?: string;
    blockNumber: number;
    logIndex: number;
};

/** The signed principal delta (base units) contributed by a single event */
export const getPrincipalFlow = (event: TokenFlowEvent): BigNumber => {
    const value = BigNumber.from(event.value);
    const balanceIncrease = BigNumber.from(event.balanceIncrease ?? 0);

    switch (event.kind) {
        case "Mint":
            // can be negative: a burn-side Mint means principal was removed
            return value.sub(balanceIncrease);
        case "Burn":
            return value.add(balanceIncrease).mul(-1);
        case "TransferIn":
            return value;
        case "TransferOut":
            return value.mul(-1);
    }
};

export const getNetPrincipal = (events: TokenFlowEvent[]): BigNumber =>
    events.reduce((sum, event) => sum.add(getPrincipalFlow(event)), BigNumber.from(0));

/**
 * Total interest accrued by the position over its whole life, in base units.
 * For supply positions this is interest earned; for variable debt positions it is
 * interest owed (paid + currently outstanding).
 */
export const getAccruedInterest = (
    currentBalanceRaw: string,
    events: TokenFlowEvent[]
): BigNumber => BigNumber.from(currentBalanceRaw).sub(getNetPrincipal(events));

/**
 * Aave's ray math can round each balance update by up to a wei, so a position
 * with zero real interest (e.g. sUSDe, whose supply APY is 0%) can compute a few
 * wei negative. Treat a negative total within eventCount + 1 wei of zero as
 * rounding dust; anything more negative is a genuine data problem.
 */
export const clampRoundingDust = (accrued: BigNumber, eventCount: number): BigNumber =>
    accrued.isNegative() && accrued.abs().lte(eventCount + 1)
        ? BigNumber.from(0)
        : accrued;

const byChainOrder = (a: TokenFlowEvent, b: TokenFlowEvent) =>
    a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

/** The earliest event that added principal to the position (for "since" display) */
export const findFirstPrincipalEvent = (events: TokenFlowEvent[]): TokenFlowEvent | undefined =>
    [...events]
        .sort(byChainOrder)
        .find(event =>
            (event.kind === "Mint" || event.kind === "TransferIn") &&
            getPrincipalFlow(event).gt(0)
        );
