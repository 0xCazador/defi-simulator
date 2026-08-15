import { Checkbox } from "@mantine/core";
import { Trans } from "@lingui/react/macro";

type UserAssetUseAsCollateralToggleProps = {
  assetSymbol: string;
  usageAsCollateralEnabledOnUser: boolean;
  setUseReserveAssetAsCollateral?: (symbol: string, value: boolean) => void;
  disableSetUseReserveAssetAsCollateral: boolean;
};

export const UserAssetUseAsCollateralToggle = ({
  assetSymbol,
  usageAsCollateralEnabledOnUser,
  setUseReserveAssetAsCollateral,
  disableSetUseReserveAssetAsCollateral,
}: UserAssetUseAsCollateralToggleProps) => {
  const handleSetUseReserveAssetAsCollateral = () => {
    setUseReserveAssetAsCollateral?.(
      assetSymbol,
      !usageAsCollateralEnabledOnUser,
    );
  };

  const label = <Trans>{`Use ${assetSymbol} as collateral`}</Trans>;

  return (
    <Checkbox
      disabled={disableSetUseReserveAssetAsCollateral}
      size="sm"
      checked={usageAsCollateralEnabledOnUser}
      label={label}
      onChange={handleSetUseReserveAssetAsCollateral}
      mt={5}
      mb={12}
    />
  );
};

export default UserAssetUseAsCollateralToggle;
