import react from "react";

import { AssetDetails } from "../hooks/useAaveData";

type AssetAPYProps = {
    assetDetails: AssetDetails,
    assetType: "BORROW" | "RESERVE",
    stableBorrowAPY?: number,
    isStableBorrow?: boolean
};

export const AssetAPY = ({
    assetDetails,
    assetType,
    stableBorrowAPY = 0,
    isStableBorrow = false
}: AssetAPYProps) => {
    const apy: number = assetType === "RESERVE"
        ? assetDetails.supplyAPY || 0
        : isStableBorrow
            ? stableBorrowAPY || 0
            : assetDetails.variableBorrowAPY || 0;

    const apySuffix: string = assetType === "RESERVE"
        ? ""
        : isStableBorrow
            ? "(stable)"
            : "(variable)";

    const display: string = `${(apy * 100).toFixed(2)}% APY ${apySuffix}`;

    return <span>{display}</span>
};
