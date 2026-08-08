import { memo } from "react";
import { t } from "@lingui/macro";
import {
  ActionIcon,
  Center,
  Container,
  Divider,
  Flex,
  Grid,
  Group,
  Paper,
  Space,
  Text,
  Tooltip,
} from "@mantine/core";
import { FaAsterisk } from "react-icons/fa";
import { CgRemoveR } from "react-icons/cg";

import { AssetDetails } from "../../hooks/useAaveData";
import TokenIcon from "../TokenIcon";
import { AssetAPY } from "../AssetAPY";
import ReserveAssetDetailsDialog from "../ReserveAssetDetailsDialog";
import BorrowedAssetDetailsDialog from "../BorrowedAssetDetailsDialog";
import { UserAssetQuantityInput } from "./UserAssetQuantityInput";
import { UserAssetPriceInput } from "./UserAssetPriceInput";
import { UserAssetItemQuantityPriceSummary } from "./UserAssetItemQuantityPriceSummary";
import { UserAssetUseAsCollateralToggle } from "./UserAssetUseAsCollateralToggle";

export type UserAssetItemProps = {
  assetSymbol: string;
  usageAsCollateralEnabledOnUser: boolean;
  assetType: "RESERVE" | "BORROW";
  assetDetails: AssetDetails;
  isStableBorrow?: boolean;
  stableBorrowAPY?: number;
  workingQuantity: number;
  originalQuantity: number;
  workingPrice: number;
  originalPrice: number;
  onRemoveAsset: (symbol: string, assetType: string) => void;
  setAssetPriceInUSD: (symbol: string, price: number) => void;
  setAssetQuantity: (symbol: string, quantity: number) => void;
  setUseReserveAssetAsCollateral?: (symbol: string, value: boolean) => void;
  disableSetUseReserveAssetAsCollateral: boolean;
  isNewlyAddedBySimUser: boolean;
  // Not read by the component itself, but used by UserAssetItemPropsChecker
  // as a memo invalidation key so rows re-render when the locale changes.
  // eslint-disable-next-line react/no-unused-prop-types
  locale: string;
};

const UserAssetItemPropsChecker = (
  oldProps: UserAssetItemProps,
  newProps: UserAssetItemProps
) => {
  const oldQuantity = oldProps.workingQuantity;
  const oldPriceInUSD = oldProps.workingPrice;
  const oldCollateralEnabled = oldProps.usageAsCollateralEnabledOnUser;

  const newQuantity = newProps.workingQuantity;
  const newPriceInUSD = newProps.workingPrice;
  const newCollateralEnabled = newProps.usageAsCollateralEnabledOnUser;

  const arePropsEqual =
    oldQuantity === newQuantity &&
    oldPriceInUSD === newPriceInUSD &&
    oldCollateralEnabled === newCollateralEnabled &&
    oldProps.assetType === newProps.assetType &&
    oldProps.assetSymbol === newProps.assetSymbol &&
    oldProps.locale === newProps.locale;

  return arePropsEqual;
};

export const UserAssetItem = memo(
  ({
    assetSymbol,
    usageAsCollateralEnabledOnUser,
    assetType,
    workingQuantity,
    originalQuantity,
    workingPrice,
    originalPrice,
    onRemoveAsset,
    setAssetPriceInUSD,
    setAssetQuantity,
    setUseReserveAssetAsCollateral,
    disableSetUseReserveAssetAsCollateral,
    isNewlyAddedBySimUser,
    assetDetails,
    isStableBorrow = false,
    stableBorrowAPY = 0,
  }: UserAssetItemProps) => (
    <Paper mt="xl" mb="xl" withBorder p="xs" bg="var(--mantine-color-dark-6)">
      <Flex justify="space-between">
        <Group mb="sm">
          <TokenIcon symbol={assetSymbol} size="24px" alt={`${assetSymbol}`} />
          <Text fz="md" fw={700} span>
            {assetSymbol}
          </Text>
          <Divider orientation="vertical" variant="dotted" />
          <Text fz="xs" span>
            <AssetAPY
              assetType={assetType}
              assetDetails={assetDetails}
              isStableBorrow={isStableBorrow}
              stableBorrowAPY={stableBorrowAPY}
            />
          </Text>
          <Divider orientation="vertical" variant="dotted" />

          {assetType === "RESERVE" ? (
            <ReserveAssetDetailsDialog assetDetails={assetDetails} />
          ) : (
            <BorrowedAssetDetailsDialog
              assetDetails={assetDetails}
              isStableBorrow={isStableBorrow}
              stableBorrowAPY={stableBorrowAPY}
            />
          )}
        </Group>

        <Tooltip label={t`Remove ${assetSymbol}`} position="left" withArrow>
          <ActionIcon
            aria-label={t`Remove ${assetSymbol}`}
            onClick={() => onRemoveAsset(assetSymbol, assetType)}
          >
            <CgRemoveR size={16} />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <Grid columns={17}>
        <Grid.Col span={{ base: 17, sm: 8 }}>
          <UserAssetQuantityInput
            assetSymbol={assetSymbol}
            workingQuantity={workingQuantity}
            originalQuantity={originalQuantity}
            isNewlyAddedBySimUser={isNewlyAddedBySimUser}
            setAssetQuantity={setAssetQuantity}
          />
        </Grid.Col>
        <Grid.Col span={1} visibleFrom="sm">
          <Center style={{ height: "100%" }}>
            <FaAsterisk />
          </Center>
        </Grid.Col>
        <Grid.Col span={{ base: 17, sm: 8 }}>
          <UserAssetPriceInput
            assetSymbol={assetSymbol}
            workingPrice={workingPrice}
            originalPrice={originalPrice}
            setAssetPriceInUSD={setAssetPriceInUSD}
          />
        </Grid.Col>
      </Grid>
      <Container
        mt="xs"
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: "16px",
          padding: "0px",
        }}
      >
        <UserAssetItemQuantityPriceSummary
          workingQuantity={workingQuantity}
          workingPrice={workingPrice}
          originalQuantity={originalQuantity}
          originalPrice={originalPrice}
        />
      </Container>
      <Container
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0px",
          paddingTop: "6px",
        }}
      >
        {assetType === "RESERVE" ? (
          <UserAssetUseAsCollateralToggle
            assetSymbol={assetSymbol}
            usageAsCollateralEnabledOnUser={usageAsCollateralEnabledOnUser}
            setUseReserveAssetAsCollateral={setUseReserveAssetAsCollateral}
            disableSetUseReserveAssetAsCollateral={
              disableSetUseReserveAssetAsCollateral
            }
          />
        ) : (
          <Space m="lg" />
        )}
      </Container>
    </Paper>
  ),
  UserAssetItemPropsChecker
);

export default UserAssetItem;
