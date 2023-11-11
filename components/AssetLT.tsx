import { AssetDetails } from "../hooks/useAaveData";

type AssetLTProps = {
    assetDetails: AssetDetails
};

export const AssetLT = ({
    assetDetails
}: AssetLTProps) => {
    const lt: number = assetDetails.reserveLiquidationThreshold;
    let display: string = `${(lt / 100).toFixed(1)}%`;
    return <span>{display}</span>
};