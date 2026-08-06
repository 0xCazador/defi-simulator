import { formatUnits } from 'ethers/lib/utils';

import { BorrowedAssetDataItem, MAX_TX_HISTORY_ITEMS, TxHistoryItem } from "../hooks/useAaveData";
import { useAaveHistory } from "../hooks/useAaveHistory";
import { Loader } from "@mantine/core";
import LocalizedFiatDisplay from "./LocalizedFiatDisplay";
import { Trans } from "@lingui/macro";

type BorrowedAssetAPYAccruedProps = {
    asset: BorrowedAssetDataItem
    address: string,
    resolvedAddress: string
};

export const BorrowedAssetAPYAccrued = ({
    asset,
    address,
    resolvedAddress
}: BorrowedAssetAPYAccruedProps) => {
    const { history } = useAaveHistory(address, resolvedAddress);

    if (!history || history.isFetching) {
        return (
            <span><Loader variant="dots" color="dimmed" /></span>
        )
    }

    if (!asset) return <span>---</span>;

    let principalValue: number = asset.totalBorrows;
    let accruedValue: number = 0;

    const historyItems: TxHistoryItem[] = history.data
        .filter(item => (item.reserve?.symbol?.toUpperCase() || item.collateralReserve?.symbol?.toUpperCase() || item.principalReserve?.symbol?.toUpperCase()) === asset.asset.symbol?.toUpperCase())
        .sort((a, b) => a.timestamp - b.timestamp);

    historyItems.forEach(txItem => {

        if (txItem.action === "Repay") {
            const amount: number = Number(formatUnits(txItem.amount ?? "0", txItem.reserve?.decimals));
            principalValue += amount;
        }

        if (txItem.action === "Borrow") {
            const amount: number = Number(formatUnits(txItem.amount ?? "0", txItem.reserve?.decimals));
            principalValue -= amount;
        }

        if (txItem.action === "LiquidationCall") {
            // isCollateral means the asset is being used to repay a different liquidated asset.
            const isCollateral: boolean = txItem.collateralReserve?.symbol?.toUpperCase() === asset.asset.symbol?.toUpperCase();

            if (isCollateral) {
                const amount: number = Number(formatUnits(txItem.collateralAmount ?? "0", txItem.collateralReserve?.decimals));
                principalValue += amount;

            } else {
                const amount: number = Number(formatUnits(txItem.principalAmount ?? "0", txItem.principalReserve?.decimals));
                principalValue -= amount;
            }

        }
    });

    accruedValue = principalValue;

    // Unfortunately, the tx history logic is not perfect. We currently don't have a way to account for 
    // assets that are switched *from* in the UI, and we don't have a reliable way of determining whether
    // an asset has undergone one of these switch operations. Also, the history API truncates at
    // MAX_TX_HISTORY_ITEMS, so a maxed-out history is likely incomplete. For now, we'll perform some
    // sanity logic on the value and if the value fails that check, we won't display it. We can consider
    // this accrual logic experimental.
    let isInvalidValue: boolean = false;
    if (accruedValue < 0) isInvalidValue = true;
    if (history.data.length >= MAX_TX_HISTORY_ITEMS) isInvalidValue = true;
    if (history.fetchError?.length > 0) isInvalidValue = true;
    if (!history?.data?.length) isInvalidValue = true;

    if (isInvalidValue) {
        return (
            <Trans><span>Unavailable</span></Trans>
        )
    }

    const oldestTx: TxHistoryItem | undefined = historyItems.find(item => item.action === "Borrow");
    const valueDisplay: string = `${accruedValue?.toFixed(3)} ${asset.asset.symbol} `;
    const dateDisplay: string = oldestTx?.timestamp
        ? ` since ${new Date(oldestTx.timestamp * 1000).toLocaleDateString()}`
        : "";

    return (
        <span>
            {valueDisplay}
            (<LocalizedFiatDisplay valueUSD={accruedValue * asset.asset.priceInUSD} />)
            {dateDisplay}
        </span>
    )
};