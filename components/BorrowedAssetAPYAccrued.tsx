import { BorrowedAssetDataItem, MAX_TX_HISTORY_ITEMS } from "../hooks/useAaveData";
import { useAaveHistory } from "../hooks/useAaveHistory";
import { getAccruedBorrowInterest } from "../utils/accruedInterest";
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

    const { accruedValue, oldestPrincipalTx } = getAccruedBorrowInterest(
        asset.totalBorrows,
        asset.asset,
        history.data
    );

    // The accrual math is only correct when we have the complete principal flow history.
    // Flows we can't see (debt switches, truncated history) distort the value, so
    // sanity-check it and hide it when it's implausible. We can consider this accrual
    // logic experimental.
    let isInvalidValue: boolean = false;
    if (accruedValue < 0) isInvalidValue = true;
    if (history.data.length >= MAX_TX_HISTORY_ITEMS) isInvalidValue = true;
    if (history.fetchError?.length > 0) isInvalidValue = true;
    if (!history?.data?.length) isInvalidValue = true;
    // without a Borrow tx establishing the position, the "accrued" value is meaningless
    // (e.g. debt acquired via a debt-switch adapter would show the entire debt as interest)
    if (!oldestPrincipalTx) isInvalidValue = true;

    if (isInvalidValue) {
        return (
            <Trans><span>Unavailable</span></Trans>
        )
    }

    const valueDisplay: string = `${accruedValue?.toFixed(3)} ${asset.asset.symbol} `;
    const dateDisplay: string = oldestPrincipalTx?.timestamp
        ? ` since ${new Date(oldestPrincipalTx.timestamp * 1000).toLocaleDateString()}`
        : "";

    return (
        <span>
            {valueDisplay}
            (<LocalizedFiatDisplay valueUSD={accruedValue * asset.asset.priceInUSD} />)
            {dateDisplay}
        </span>
    )
};
