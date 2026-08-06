import { MAX_TX_HISTORY_ITEMS, ReserveAssetDataItem } from "../hooks/useAaveData";
import { useAaveHistory } from "../hooks/useAaveHistory";
import { getAccruedSupplyInterest } from "../utils/accruedInterest";
import { Loader } from "@mantine/core";
import LocalizedFiatDisplay from "./LocalizedFiatDisplay";
import { Trans } from "@lingui/macro";

type ReserveAssetAPYAccruedProps = {
    asset: ReserveAssetDataItem
    address: string,
    resolvedAddress: string
};

export const ReserveAssetAPYAccrued = ({
    asset,
    address,
    resolvedAddress
}: ReserveAssetAPYAccruedProps) => {
    const { history } = useAaveHistory(address, resolvedAddress);

    if (!history || history.isFetching) {
        return (
            <span><Loader variant="dots" /></span>
        )
    }

    if (!asset) return <span>---</span>;

    const { accruedValue, oldestPrincipalTx } = getAccruedSupplyInterest(
        asset.underlyingBalance,
        asset.asset,
        history.data
    );

    // The accrual math is only correct when we have the complete principal flow history.
    // Flows we can't see (aToken transfers, collateral switches, repay-with-aTokens,
    // truncated history) distort the value, so sanity-check it and hide it when it's
    // implausible. We can consider this accrual logic experimental.
    let isInvalidValue: boolean = false;
    if (accruedValue < 0) isInvalidValue = true;
    if (history.data.length >= MAX_TX_HISTORY_ITEMS) isInvalidValue = true;
    if (accruedValue > (asset.underlyingBalance * .25)) isInvalidValue = true;
    if (history.fetchError?.length > 0) isInvalidValue = true;
    if (!history?.data?.length) isInvalidValue = true;
    // without a Supply tx establishing the position, the "accrued" value is meaningless
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
