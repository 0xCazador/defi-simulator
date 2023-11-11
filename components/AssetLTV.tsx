import { AssetDetails } from "../hooks/useAaveData";

type AssetLTVProps = {
    assetDetails: AssetDetails
};

export const AssetLTV = ({
    assetDetails
}: AssetLTVProps) => {
    const lt: number = assetDetails.baseLTVasCollateral;
    let display: string = `${(lt / 100).toFixed(1)}%`;
    return <span>{display}</span>
};