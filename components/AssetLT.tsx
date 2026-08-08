import { AssetDetails } from "../hooks/useAaveData";

type AssetLTProps = {
  assetDetails: AssetDetails;
};

export const AssetLT = ({ assetDetails }: AssetLTProps) => {
  // Prefer liquid-eMode-resolved effective LT when present; otherwise base.
  const ltBps: number =
    assetDetails.effectiveLiquidationThreshold ??
    assetDetails.reserveLiquidationThreshold;
  const display: string = `${(ltBps / 100).toFixed(1)}%`;
  const suffix = assetDetails.isEModeCollateral ? " (E-Mode)" : "";
  return (
    <span>
      {display}
      {suffix}
    </span>
  );
};
