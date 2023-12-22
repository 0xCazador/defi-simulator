import * as React from "react";
import { t, Trans } from "@lingui/macro";

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
import {
    useAaveData,
    AssetDetails,
    markets,
    ReserveAssetDataItem,
    BorrowedAssetDataItem,
    AaveMarketDataType,
} from "../hooks/useAaveData";
import { TbListDetails } from "react-icons/tb";
import { AiTwotoneExperiment } from "react-icons/ai";
import { AbbreviatedEthereumAddress } from "./AddressCard";
import { FaCopy } from "react-icons/fa";
import { AssetAPY } from "./AssetAPY";
import { ReserveAssetAPYAccrued } from "./ReserveAssetAPYAccrued";
import { forwardRef } from "react";
import { AssetLT } from "./AssetLT";
import { AssetLTV } from "./AssetLTV";
import { BorrowedAssetAPYAccrued } from "./BorrowedAssetAPYAccrued";

type BorrowedAssetDetailsDialogProps = {
    assetDetails: AssetDetails,
    stableBorrowAPY?: number,
    isStableBorrow: boolean
}

export default function BorrowedAssetDetailsDialog({ assetDetails, isStableBorrow, stableBorrowAPY }: BorrowedAssetDetailsDialogProps) {
    const [open, setOpen] = React.useState(false);
    const { addressData, currentMarket, currentAddress } = useAaveData("", true);

    const market = markets.find((market) => market.id === currentMarket) as AaveMarketDataType;
    const asset = addressData?.[currentMarket]?.workingData?.userBorrowsData?.find(r => r.asset.symbol === assetDetails.symbol) as BorrowedAssetDataItem;
    const fetchedAsset = addressData?.[currentMarket]?.fetchedData?.userBorrowsData?.find(r => r.asset.symbol === assetDetails.symbol) as BorrowedAssetDataItem;
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
                    compact
                    onClick={() => { setOpen(true) }}
                >
                    <Text size="xs">
                        <Trans>Details</Trans>
                    </Text>
                </Button>
            </Tooltip>
        )
    }

    return (
        <>
            <Modal
                size="lg"
                opened={open}
                onClose={() => {
                    setOpen(false);
                }}
                title={t`Borrowed ${assetDetails?.symbol} Details`}>

                <Divider label="Interest Information" mb={20} mt={20} labelPosition="center" />

                <SimpleGrid cols={2}>
                    <AssetDetailsItem
                        title="Current Borrow Interest Rate: "
                        description="The Current Borrow Interest Rate represents the annual percentage yield rate incurred by this asset."
                        node={<AssetAPY assetType={"BORROW"} assetDetails={assetDetails} isStableBorrow={isStableBorrow} stableBorrowAPY={stableBorrowAPY} />} />
                    <AssetDetailsItem
                        title="Accrued Interest: "
                        description="Experimental. The Accrued Interest refers to the total interest accrued by this borrowed asset since it was first borrowed in the current market by the user. This feature is experimental, there may be miscalculations, or it may not be available for all assets."
                        node={<BorrowedAssetAPYAccrued asset={fetchedAsset} address={currentAddress} resolvedAddress={resolvedAddress} />}
                        titleIcon={
                            <Tooltip
                                label={t`Experimental Feature`}
                                position="right"
                                withArrow
                            >
                                <IconForTooltip>
                                    <Text span mr="xs" c="blue">
                                        <AiTwotoneExperiment />
                                    </Text>
                                </IconForTooltip>
                            </Tooltip>
                        } />
                </SimpleGrid>

                <Divider label={t`Contract Information`} mb={20} mt={20} labelPosition="center" />

                <SimpleGrid cols={2}>
                    <AssetDetailsItem
                        title={t`${isStableBorrow ? "Stable" : "Variable"} Debt Token Contract`}
                        description={t`The ${isStableBorrow ? "Stable" : "Variable"} Debt Token Contract refers to the Aave debt token contract that corresponds to the underlying borrowed asset.`}
                        node={<AssetDetailsAddress address={isStableBorrow ? assetDetails?.stableDebtTokenAddress : assetDetails?.variableDebtTokenAddress} explorer={market?.explorer} />} />
                    <AssetDetailsItem
                        title="Underlying Asset Contract: "
                        description="The Underlying Asset Contract refers to the token contract that represents the borrowed token."
                        node={<AssetDetailsAddress address={assetDetails?.underlyingAsset} explorer={market?.explorer} />} />
                </SimpleGrid>

                <Divider label="Risk Parameters" mb={20} mt={20} labelPosition="center" />

                <SimpleGrid cols={2} mb="xl">
                    <AssetDetailsItem
                        title="Liquidation Threshold: "
                        description="The Liquidation Threshold refers to the loan to value percentage that makes the position subject to liquidation. This value represents the Liquidation Threshold provided by this asset."
                        node={<AssetLT assetDetails={assetDetails} />} />
                    <AssetDetailsItem
                        title="Max Loan to Value: "
                        description="Maximum Loan to Value refers to the loan to value percentage where new loans may not be initiated. This value represents the Maximum Loan to Value provided by this asset."
                        node={<AssetLTV assetDetails={assetDetails} />} />

                </SimpleGrid>

                <Space h="xl" />

                <Group position="center">
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
                <ActionIcon>
                    <TbListDetails
                        title={t`${assetDetails?.symbol} Details`}
                        size={16}
                        onClick={() => { setOpen(true) }}
                    />
                </ActionIcon>
            </Tooltip>
        </>
    );
}


type AssetDetailsAddressProps = {
    address: string | undefined,
    explorer: string
}

const AssetDetailsAddress = ({ address = "", explorer }: AssetDetailsAddressProps) => {
    const [showCopied, setShowCopied] = React.useState(false);

    const handleCopy = (address: string) => {
        navigator.clipboard.writeText(address);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2500);
    };

    return (
        <>
            <a
                href={explorer.replace("{{ADDRESS}}", address)}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#e9ecef" }}
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
    )

}


type CopyButtonForTooltipProps = {
    onCopy: (copyValue: string) => void,
    copyValue: string
}

const CopyButtonForTooltip = forwardRef<HTMLSpanElement, CopyButtonForTooltipProps>((props, ref) => {
    return (
        <span ref={ref}>
            <FaCopy
                style={{ marginLeft: "5px", cursor: "pointer" }}
                title={t`Copy address to clipboard`}
                onClick={() => props.onCopy(props.copyValue)}
            />
        </span>
    )
});

type IconForTooltipProps = {
    children: React.ReactNode
}

export const IconForTooltip = forwardRef<HTMLSpanElement, IconForTooltipProps>((props, ref) => {
    return (
        <span ref={ref}>
            {props.children}
        </span>
    )
});

type AssetDetailsItemProps = {
    title: string,
    titleIcon?: React.ReactNode,
    description: string,
    node: React.ReactNode
}

export const AssetDetailsItem = ({ title, titleIcon = null, description, node }: AssetDetailsItemProps) => {
    return (
        <Center>
            <Paper>
                <Text size="xs" align="center">
                    {titleIcon}
                    <Popover width="250px" withArrow shadow="md">
                        <Popover.Target>
                            <Text
                                span
                                fz="xs"
                                underline
                                style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                            >
                                <Trans>{title}</Trans>
                            </Text>
                        </Popover.Target>
                        <Popover.Dropdown>
                            <Trans>
                                <Text size="sm">
                                    {description}
                                </Text>
                            </Trans>
                        </Popover.Dropdown>
                    </Popover>
                    <Text fw="600">
                        {node}
                    </Text>
                </Text>
            </Paper>
        </Center>
    )
}
