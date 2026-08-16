import * as React from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useRouter } from "next/router";

import {
  Button,
  Group,
  Modal,
  Tooltip,
  ActionIcon,
  Text,
  Center,
  SimpleGrid,
  Paper,
  Divider,
  Space,
  Popover,
} from "@mantine/core";
import { TbListDetails } from "react-icons/tb";
import { FaCopy } from "react-icons/fa";
import { forwardRef } from "react";
import {
  useAaveData,
  AssetDetails,
  markets,
  ReserveAssetDataItem,
  AaveMarketDataType,
} from "../hooks/useAaveData";
import { AbbreviatedEthereumAddress } from "./position/AbbreviatedEthereumAddress";
import { AssetAPY } from "./AssetAPY";
import { AccruedInterestStat, AssetStatCard } from "./AccruedInterestStat";
import { AssetLT } from "./AssetLT";
import { AssetLTV } from "./AssetLTV";

type ReserveAssetDetailsDialogProps = {
  assetDetails: AssetDetails;
};

export default function ReserveAssetDetailsDialog({
  assetDetails,
}: ReserveAssetDetailsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { addressData, currentMarket, currentAddress } = useAaveData("", true);

  const market = markets.find(
    (mkt) => mkt.id === currentMarket,
  ) as AaveMarketDataType;
  const asset = addressData?.[
    currentMarket
  ]?.workingData?.userReservesData?.find(
    (r) => r.asset.symbol === assetDetails.symbol,
  ) as ReserveAssetDataItem;
  const fetchedAsset = addressData?.[
    currentMarket
  ]?.fetchedData?.userReservesData?.find(
    (r) => r.asset.symbol === assetDetails.symbol,
  ) as ReserveAssetDataItem;
  const resolvedAddress: string = addressData?.[currentMarket]?.resolvedAddress;

  if (!market || !currentAddress || !asset) return null;

  if (!open) {
    return (
      <Tooltip
        label={t`${assetDetails?.symbol} Details`}
        position="right"
        withArrow
      >
        <Button
          title={t`${assetDetails?.symbol} Details`}
          variant="subtle"
          color="gray"
          size="compact-sm"
          onClick={() => {
            setOpen(true);
          }}
        >
          <Text size="xs" span>
            <Trans>Details</Trans>
          </Text>
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Modal
        size="lg"
        opened={open}
        onClose={() => {
          setOpen(false);
        }}
        title={t`Supplied ${assetDetails?.symbol} Details`}
      >
        <Divider
          label={t`Interest Information`}
          mb={20}
          mt={20}
          labelPosition="center"
        />

        <SimpleGrid cols={2} spacing="sm">
          <AssetStatCard>
            <AssetDetailsItem
              title={t`Current Supply Yield: `}
              description={t`The Current Supply Yield represents the current annual percentage yield accrued by the supplied asset.`}
              node={
                <AssetAPY assetType="RESERVE" assetDetails={assetDetails} />
              }
            />
          </AssetStatCard>
          <AssetStatCard>
            <AccruedInterestStat
              side="supply"
              symbol={fetchedAsset?.asset?.symbol}
              priceInUSD={fetchedAsset?.asset?.priceInUSD}
              tokenAddress={fetchedAsset?.asset?.aTokenAddress}
              address={currentAddress}
              resolvedAddress={resolvedAddress}
              onViewHistory={() => {
                setOpen(false);
                router.push(`/interest?address=${currentAddress}`);
              }}
            />
          </AssetStatCard>
        </SimpleGrid>

        <Divider
          label={t`Contract Information`}
          mb={20}
          mt={20}
          labelPosition="center"
        />

        <SimpleGrid cols={2}>
          {/* v4 has no aTokens: positions live in the Spoke contract itself. */}
          <AssetDetailsItem
            title={market?.v4 ? t`Spoke Contract: ` : t`aToken Contract: `}
            description={
              market?.v4
                ? t`The Spoke Contract is the Aave v4 market contract that holds this supplied position; v4 has no separate aToken contracts.`
                : t`The aToken Contract refers to the Aave token contract that corresponds to the supplied asset.`
            }
            node={
              <AssetDetailsAddress
                address={
                  market?.v4
                    ? market?.v4Addresses?.SPOKE
                    : assetDetails?.aTokenAddress
                }
                explorer={market?.explorer}
              />
            }
          />
          <AssetDetailsItem
            title={t`Underlying Asset Contract: `}
            description={t`The Underlying Asset Contract refers to the token contract that represents the supplied token.`}
            node={
              <AssetDetailsAddress
                address={assetDetails?.underlyingAsset}
                explorer={market?.explorer}
              />
            }
          />
        </SimpleGrid>

        <Divider
          label={t`Risk Parameters`}
          mb={20}
          mt={20}
          labelPosition="center"
        />

        <SimpleGrid cols={2} mb="xl">
          <AssetDetailsItem
            title={t`Liquidation Threshold: `}
            description={t`The Liquidation Threshold refers to the loan to value percentage that makes the position subject to liquidation. This value represents the Liquidation Threshold provided by this asset.`}
            node={<AssetLT assetDetails={assetDetails} />}
          />
          <AssetDetailsItem
            title={t`Max Loan to Value: `}
            description={t`Maximum Loan to Value refers to the loan to value percentage where new loans may not be initiated. This value represents the Maximum Loan to Value provided by this asset.`}
            node={<AssetLTV assetDetails={assetDetails} />}
          />
        </SimpleGrid>

        <Space h="xl" />

        <Group justify="center">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t`Done`}
          </Button>
        </Group>
      </Modal>
      <Tooltip
        label={t`${assetDetails?.symbol} Details`}
        position="right"
        withArrow
      >
        <ActionIcon
          aria-label={t`${assetDetails?.symbol} Details`}
          onClick={() => {
            setOpen(true);
          }}
        >
          <TbListDetails size={16} />
        </ActionIcon>
      </Tooltip>
    </>
  );
}

type AssetDetailsAddressProps = {
  address: string | undefined;
  explorer: string;
};

const AssetDetailsAddress = ({
  address = "",
  explorer,
}: AssetDetailsAddressProps) => {
  const [showCopied, setShowCopied] = React.useState(false);

  const handleCopy = (addressToCopy: string) => {
    navigator.clipboard.writeText(addressToCopy);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2500);
  };

  return (
    <>
      <a
        href={explorer.replace("{{ADDRESS}}", address)}
        target="_blank"
        rel="noreferrer"
        style={{ color: "var(--mantine-color-dark-0)" }}
      >
        <AbbreviatedEthereumAddress address={address} />
      </a>
      <Tooltip
        label={
          showCopied
            ? t`Address copied to clipboard!`
            : t`Copy address to clipboard`
        }
        opened={showCopied ? true : undefined}
        color={showCopied ? "green" : undefined}
      >
        <CopyButtonForTooltip onCopy={handleCopy} copyValue={address} />
      </Tooltip>
    </>
  );
};

type CopyButtonForTooltipProps = {
  onCopy: (copyValue: string) => void;
  copyValue: string;
};

const CopyButtonForTooltip = forwardRef<
  HTMLSpanElement,
  CopyButtonForTooltipProps
>((props, ref) => (
  <span ref={ref}>
    <ActionIcon
      size="sm"
      ml={5}
      display="inline-flex"
      aria-label={t`Copy address to clipboard`}
      onClick={() => props.onCopy(props.copyValue)}
    >
      <FaCopy />
    </ActionIcon>
  </span>
));

type AssetDetailsItemProps = {
  title: string;
  titleIcon?: React.ReactNode;
  description: string;
  node: React.ReactNode;
};

export const AssetDetailsItem = ({
  title,
  titleIcon = null,
  description,
  node,
}: AssetDetailsItemProps) => (
  <Center>
    <Paper>
      <Text size="xs" ta="center" component="div">
        {titleIcon}
        <Popover width="250px" withArrow shadow="md">
          <Popover.Target>
            <Text
              span
              fz="xs"
              td="underline"
              style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
            >
              <Trans>{title}</Trans>
            </Text>
          </Popover.Target>
          <Popover.Dropdown>
            <Trans>
              <Text size="sm">{description}</Text>
            </Trans>
          </Popover.Dropdown>
        </Popover>
        <Text fw="600" span>
          {node}
        </Text>
      </Text>
    </Paper>
  </Center>
);
