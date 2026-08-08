import { Center, Container, Text, Title } from "@mantine/core";
import { Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { ImmutableArray } from "@hookstate/core";

import {
  BorrowedAssetDataItem,
  markets,
  useAaveData,
} from "../../hooks/useAaveData";
import AddAssetDialog from "../AddAssetDialog";
import { AbbreviatedEthereumAddress } from "../position/AbbreviatedEthereumAddress";
import { UserAssetItem } from "./UserAssetItem";

type UserBorrowedAssetListProps = {
  summaryOffset: number;
};

export const UserBorrowedAssetList = ({
  summaryOffset,
}: UserBorrowedAssetListProps) => {
  const {
    addressData,
    currentMarket,
    currentAddress,
    removeAsset,
    setAssetPriceInUSD,
    setBorrowedAssetQuantity,
  } = useAaveData("");
  const { i18n } = useLingui();
  const items: ImmutableArray<BorrowedAssetDataItem> =
    addressData?.[currentMarket]?.workingData?.userBorrowsData || [];

  const market = markets.find((mkt) => mkt.id === currentMarket);

  return (
    <div style={{ marginTop: "15px" }}>
      <Container
        style={{
          marginTop: "15px",
          display: "flex",
          justifyContent: "space-between",
          padding: "0px",
          paddingBottom: "5px",
          position: "sticky",
          top: `${summaryOffset}px`,
          zIndex: "3",
          backgroundColor: "var(--mantine-color-body)",
        }}
      >
        <Title order={4} style={{ marginBottom: "10px" }}>
          <Trans>Borrowed Assets</Trans>
        </Title>
        <AddAssetDialog assetType="BORROW" />
      </Container>
      {items.length === 0 && (
        <Center>
          <Text fz="sm" m={25} ta="center">
            <Trans>
              {"There are no borrowed assets for "}
              <AbbreviatedEthereumAddress address={currentAddress} />
              {` in the ${market?.title} market. Select "Add Borrow Asset" to simulate borrowed assets for this address.`}
            </Trans>
          </Text>
        </Center>
      )}
      {items.map((item, idx) => {
        const originalAsset = addressData?.[
          currentMarket
        ]?.fetchedData?.userBorrowsData?.find(
          (asset) => asset.asset.symbol === item.asset.symbol
        );
        return (
          <UserAssetItem
            key={`${item.asset.symbol}-BORROW-${idx}`}
            assetSymbol={item.asset.symbol}
            assetDetails={item.asset}
            isNewlyAddedBySimUser={!!item.asset.isNewlyAddedBySimUser}
            assetType="BORROW"
            isStableBorrow={!!item.stableBorrows}
            stableBorrowAPY={item.stableBorrowAPY}
            usageAsCollateralEnabledOnUser={false}
            workingQuantity={item.totalBorrows}
            originalQuantity={originalAsset?.totalBorrows ?? 0}
            workingPrice={item.asset.priceInUSD}
            originalPrice={originalAsset?.asset.priceInUSD ?? 0}
            onRemoveAsset={removeAsset}
            setAssetPriceInUSD={setAssetPriceInUSD}
            setAssetQuantity={setBorrowedAssetQuantity}
            disableSetUseReserveAssetAsCollateral={false}
            locale={i18n?.locale || ""}
          />
        );
      })}
    </div>
  );
};

export default UserBorrowedAssetList;
