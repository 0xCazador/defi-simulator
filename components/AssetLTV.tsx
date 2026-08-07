import { AssetDetails } from "../hooks/useAaveData";

type AssetLTVProps = {
    assetDetails: AssetDetails
};

export const AssetLTV = ({
    assetDetails
}: AssetLTVProps) => {
    // Prefer liquid-eMode-resolved effective LTV when present; otherwise base.
    const ltvBps: number =
        assetDetails.effectiveLtv ?? assetDetails.baseLTVasCollateral;
    const display: string = `${(ltvBps / 100).toFixed(1)}%`;
    const suffix = assetDetails.isEModeCollateral ? " (E-Mode)" : "";
    return <span>{display}{suffix}</span>
};
