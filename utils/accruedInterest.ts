import { formatUnits } from 'ethers/lib/utils';

import { TxHistoryItem, TxHistoryReserveItem } from '../hooks/useAaveData';

export type AccruedInterestAsset = {
    symbol?: string;
    underlyingAsset?: string;
};

export type AccruedInterestResult = {
    /**
     * currentValue + principal outflows - principal inflows. For a complete history
     * this equals the interest accrued by the position. Negative or implausibly large
     * values indicate the history is incomplete (truncated, aToken transfers,
     * collateral/debt switches, repay-with-aTokens, etc.) and should not be displayed.
     */
    accruedValue: number;
    /** The tx that first established the position (first Supply/Borrow), if any */
    oldestPrincipalTx?: TxHistoryItem;
};

/**
 * Prefer matching by underlying asset address; fall back to symbol when either side
 * doesn't have an address (e.g. older cached data).
 */
const matchesAsset = (
    reserve: TxHistoryReserveItem | undefined,
    asset: AccruedInterestAsset
): boolean => {
    if (!reserve) return false;
    if (reserve.underlyingAsset?.length && asset.underlyingAsset?.length) {
        return reserve.underlyingAsset.toLowerCase() === asset.underlyingAsset.toLowerCase();
    }
    return !!reserve.symbol?.length && reserve.symbol.toUpperCase() === asset.symbol?.toUpperCase();
};

const toTokenAmount = (
    rawAmount: string | undefined,
    reserve: TxHistoryReserveItem | undefined
): number => Number(formatUnits(rawAmount ?? "0", reserve?.decimals ?? 18));

const byTimestampAsc = (a: TxHistoryItem, b: TxHistoryItem) => a.timestamp - b.timestamp;

/**
 * Interest accrued by a supply position:
 *
 *   accrued = currentBalance + withdrawals - supplies
 *
 * Collateral seized during a liquidation left the position without a Withdraw event,
 * so it counts as a withdrawal. Debt repaid during a liquidation does not affect the
 * supply position and is ignored.
 */
export const getAccruedSupplyInterest = (
    currentBalance: number,
    asset: AccruedInterestAsset,
    history: readonly TxHistoryItem[]
): AccruedInterestResult => {
    const items = [...history].sort(byTimestampAsc);
    let accruedValue = currentBalance;

    items.forEach(tx => {
        if ((tx.action === "RedeemUnderlying" || tx.action === "Withdraw") && matchesAsset(tx.reserve, asset)) {
            accruedValue += toTokenAmount(tx.amount, tx.reserve);
        }
        if ((tx.action === "Supply" || tx.action === "Deposit") && matchesAsset(tx.reserve, asset)) {
            accruedValue -= toTokenAmount(tx.amount, tx.reserve);
        }
        if (tx.action === "LiquidationCall" && matchesAsset(tx.collateralReserve, asset)) {
            accruedValue += toTokenAmount(tx.collateralAmount, tx.collateralReserve);
        }
    });

    const oldestPrincipalTx = items.find(
        tx => (tx.action === "Supply" || tx.action === "Deposit") && matchesAsset(tx.reserve, asset)
    );

    return { accruedValue, oldestPrincipalTx };
};

/**
 * Interest accrued by a borrow position:
 *
 *   accrued = currentDebt + repayments - borrows
 *
 * Debt repaid by a liquidator reduced the debt without a Repay event, so it counts as
 * a repayment. Collateral seized during a liquidation does not affect the debt
 * position and is ignored.
 */
export const getAccruedBorrowInterest = (
    currentDebt: number,
    asset: AccruedInterestAsset,
    history: readonly TxHistoryItem[]
): AccruedInterestResult => {
    const items = [...history].sort(byTimestampAsc);
    let accruedValue = currentDebt;

    items.forEach(tx => {
        if (tx.action === "Repay" && matchesAsset(tx.reserve, asset)) {
            accruedValue += toTokenAmount(tx.amount, tx.reserve);
        }
        if (tx.action === "Borrow" && matchesAsset(tx.reserve, asset)) {
            accruedValue -= toTokenAmount(tx.amount, tx.reserve);
        }
        if (tx.action === "LiquidationCall" && matchesAsset(tx.principalReserve, asset)) {
            accruedValue += toTokenAmount(tx.principalAmount, tx.principalReserve);
        }
    });

    const oldestPrincipalTx = items.find(
        tx => tx.action === "Borrow" && matchesAsset(tx.reserve, asset)
    );

    return { accruedValue, oldestPrincipalTx };
};
