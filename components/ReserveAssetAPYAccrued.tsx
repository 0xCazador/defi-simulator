import { ReserveAssetDataItem, useAaveData } from "../hooks/useAaveData";
import { useAccruedInterest } from "../hooks/useAccruedInterest";
import { Loader } from "@mantine/core";
import LocalizedFiatDisplay from "./LocalizedFiatDisplay";
import { Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { formatTokenAmount } from "../utils/formatTokenAmount";

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
    const { i18n } = useLingui();
    const { currentMarket } = useAaveData(address, true);
    const accrual = useAccruedInterest(
        currentMarket,
        resolvedAddress,
        asset?.asset?.aTokenAddress,
        "supply"
    );

    if (!asset) return <span>---</span>;

    if (accrual.isFetching) {
        return (
            <span><Loader variant="dots" /></span>
        )
    }

    const accruedValue: number = Number(accrual.accruedValue ?? "0");

    // The accrual math over token events is exact, so a negative value indicates a
    // token with non-standard accounting (e.g. GHO's discounted debt) or an RPC
    // inconsistency; hide the value rather than display a wrong number.
    const isInvalidValue: boolean =
        !!accrual.fetchError?.length ||
        accrual.accruedValue === undefined ||
        accruedValue < 0;

    if (isInvalidValue) {
        return (
            <Trans><span>Unavailable</span></Trans>
        )
    }

    const valueDisplay: string = `${formatTokenAmount(accruedValue, i18n.locale)} ${asset.asset.symbol} `;
    const dateDisplay: string = accrual.sinceTimestamp
        ? ` since ${i18n.date(new Date(accrual.sinceTimestamp * 1000), { dateStyle: "medium" })}`
        : "";

    return (
        <span>
            {valueDisplay}
            (<LocalizedFiatDisplay valueUSD={accruedValue * asset.asset.priceInUSD} />)
            {dateDisplay}
        </span>
    )
};
