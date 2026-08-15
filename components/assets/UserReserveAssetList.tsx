import { CSSProperties } from "react";
import { Center, Text, Title } from "@mantine/core";
import { Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { ImmutableArray } from "@hookstate/core";

import {
  ReserveAssetDataItem,
  markets,
  useAaveData,
} from "../../hooks/useAaveData";
import AddAssetDialog from "../AddAssetDialog";
import { AbbreviatedEthereumAddress } from "../position/AbbreviatedEthereumAddress";
import { UserAssetItem } from "./UserAssetItem";
import classes from "./AssetList.module.css";

type UserReserveAssetListProps = {
  summaryOffset: number;
};

export const UserReserveAssetList = ({
  summaryOffset,
}: UserReserveAssetListProps) => {
  const {
    addressData,
    currentMarket,
    currentAddress,
    removeAsset,
    setAssetPriceInUSD,
    setReserveAssetQuantity,
    setUseReserveAssetAsCollateral,
  } = useAaveData("");
  const { i18n } = useLingui();
  const items: ImmutableArray<ReserveAssetDataItem> =
    addressData?.[currentMarket]?.workingData?.userReservesData || [];

  const market = markets.find((mkt) => mkt.id === currentMarket);

  return (
    <div style={{ marginTop: "15px" }}>
      <div
        className={classes.sectionHeader}
        style={{ "--summary-offset": `${summaryOffset}px` } as CSSProperties}
      >
        <Title order={4}>
          <Trans>Supplied Assets</Trans>
        </Title>
        <AddAssetDialog assetType="RESERVE" />
      </div>
      {items.length === 0 && (
        <Center>
          <Text fz="sm" m={25} ta="center">
            <Trans>
              {"There are no supplied assets for "}
              <AbbreviatedEthereumAddress address={currentAddress} />
              {` in the ${market?.title} market. Select "Add Supplied Asset" to simulate supplied assets for this address.`}
            </Trans>
          </Text>
        </Center>
      )}
      {items.map((item) => {
        const originalAsset = addressData?.[
          currentMarket
        ]?.fetchedData?.userReservesData?.find(
          (asset) => asset.asset.symbol === item.asset.symbol
        );
        return (
          <UserAssetItem
            key={`${item.asset.symbol}-RESERVE`}
            assetSymbol={item.asset.symbol}
            assetDetails={item.asset}
            usageAsCollateralEnabledOnUser={item.usageAsCollateralEnabledOnUser}
            assetType="RESERVE"
            workingQuantity={item.underlyingBalance}
            originalQuantity={originalAsset?.underlyingBalance ?? 0}
            workingPrice={item.asset.priceInUSD}
            originalPrice={item.asset.initialPriceInUSD ?? 0}
            onRemoveAsset={removeAsset}
            setAssetPriceInUSD={setAssetPriceInUSD}
            setAssetQuantity={setReserveAssetQuantity}
            setUseReserveAssetAsCollateral={setUseReserveAssetAsCollateral}
            disableSetUseReserveAssetAsCollateral={
              !item.asset.usageAsCollateralEnabled
            }
            isNewlyAddedBySimUser={!!item.asset.isNewlyAddedBySimUser}
            locale={i18n?.locale || ""}
          />
        );
      })}
    </div>
  );
};

export default UserReserveAssetList;
