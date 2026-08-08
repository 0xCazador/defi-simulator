import { Text } from "@mantine/core";

import LocalizedFiatDisplay from "../LocalizedFiatDisplay";

type UserAssetItemQuantityPriceSummaryProps = {
  workingQuantity: number;
  workingPrice: number;
  originalQuantity?: number;
  originalPrice: number;
};

export const UserAssetItemQuantityPriceSummary = ({
  workingQuantity,
  workingPrice,
  originalQuantity,
  originalPrice,
}: UserAssetItemQuantityPriceSummaryProps) => {
  const workingValue = workingQuantity * workingPrice;
  const originalValue = (originalQuantity || 0) * originalPrice;
  const valuedDiffers: boolean =
    originalValue > 0 && workingValue?.toFixed(2) !== originalValue?.toFixed(2);

  return (
    <div>
      {valuedDiffers && (
        <Text fz="xs" c="dimmed" style={{ display: "block" }}>
          = <LocalizedFiatDisplay valueUSD={originalValue} /> ➔
        </Text>
      )}
      <Text mt={valuedDiffers ? 0 : 19} style={{ display: "block" }}>
        <LocalizedFiatDisplay valueUSD={workingValue} includeCurrencyCode />
      </Text>
    </div>
  );
};

export default UserAssetItemQuantityPriceSummary;
