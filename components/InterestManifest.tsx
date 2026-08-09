import { useState } from "react";
import { ethers } from "ethers";
import { t, Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  Space,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { FaHistory } from "react-icons/fa";
import { FiExternalLink, FiInfo, FiSearch } from "react-icons/fi";

import {
  AaveMarketDataType,
  AssetDetails,
  markets,
  useAaveData,
} from "../hooks/useAaveData";
import {
  useAccrualLedger,
  useAccrualManifest,
} from "../hooks/useAccrualLedger";
import {
  AccrualSide,
  LedgerRow,
  ManifestAssetRef,
} from "../pages/api/aave/accrual";
import { LedgerAction } from "../utils/tokenEventAccrual";
import { formatTokenAmount } from "../utils/formatTokenAmount";
import LocalizedFiatDisplay from "./LocalizedFiatDisplay";
import TokenIcon from "./TokenIcon";
import { AbbreviatedEthereumAddress } from "./position/AbbreviatedEthereumAddress";

type SideFilter = "ALL" | "SUPPLY" | "BORROW";

type ManifestPosition = {
  asset: AssetDetails;
  side: AccrualSide;
  tokenAddress: string;
  isOpen: boolean;
};

const getActionLabel = (action: LedgerAction): string => {
  switch (action) {
    case "Supply":
      return t`Supply`;
    case "Withdraw":
      return t`Withdraw`;
    case "Borrow":
      return t`Borrow`;
    case "Repay":
      return t`Repay`;
    case "TransferIn":
      return t`Transfer in`;
    case "TransferOut":
      return t`Transfer out`;
    case "InterestApplied":
    default:
      return t`Interest applied`;
  }
};

/** Markets link addresses as `.../address/{{ADDRESS}}`; tx pages swap the path segment */
const getExplorerTxUrl = (market: AaveMarketDataType, txHash: string): string =>
  market.explorer.replace("/address/", "/tx/").replace("{{ADDRESS}}", txHash);

const matchesFilters = (
  position: ManifestPosition,
  sideFilter: SideFilter,
  searchText: string
): boolean => {
  if (sideFilter === "SUPPLY" && position.side !== "supply") return false;
  if (sideFilter === "BORROW" && position.side !== "borrow") return false;
  if (!searchText.length) return true;
  return (
    position.asset.name?.toUpperCase().includes(searchText.toUpperCase()) ||
    position.asset.symbol?.toUpperCase().includes(searchText.toUpperCase())
  );
};

export default function InterestManifest() {
  const { addressData, currentMarket, currentAddress } = useAaveData("", true);
  const [sideFilter, setSideFilter] = useState<SideFilter>("ALL");
  const [searchText, setSearchText] = useState("");

  const marketData = addressData?.[currentMarket];
  const market = markets.find(
    (m) => m.id === currentMarket
  ) as AaveMarketDataType;
  const resolvedAddress: string = marketData?.resolvedAddress ?? "";
  const manifest = useAccrualManifest(currentMarket, resolvedAddress);

  if (!market) return null;

  if (marketData?.isFetching) {
    return (
      <Center mt={50} mb={50}>
        <Loader />
      </Center>
    );
  }

  if (!ethers.utils.isAddress(resolvedAddress)) {
    return (
      <Alert icon={<FiInfo size="1rem" />} color="blue" mt={20}>
        <Trans>
          Interest history is reconstructed from on-chain events, so it is only
          available for real on-chain addresses (not simulated sandbox
          positions).
        </Trans>
      </Alert>
    );
  }

  // The manifest reflects the real on-chain position (fetchedData), never
  // simulated edits, so accrual history always matches the chain.
  const openPositions: ManifestPosition[] = [];
  marketData?.fetchedData?.userReservesData?.forEach((item) => {
    if (!item.asset.aTokenAddress) return;
    openPositions.push({
      asset: item.asset,
      side: "supply",
      tokenAddress: item.asset.aTokenAddress,
      isOpen: true,
    });
  });
  marketData?.fetchedData?.userBorrowsData?.forEach((item) => {
    if (!item.asset.variableDebtTokenAddress) return;
    openPositions.push({
      asset: item.asset,
      side: "borrow",
      tokenAddress: item.asset.variableDebtTokenAddress,
      isOpen: true,
    });
  });

  const openTokenAddresses = new Set(
    openPositions.map((position) => position.tokenAddress.toLowerCase())
  );

  // Closed positions discovered by the full-history scan: any scanned token
  // with at least one event that isn't part of the current position.
  const closedPositions: ManifestPosition[] = (manifest.results ?? [])
    .filter(
      (item) =>
        (item.data?.eventCount ?? 0) > 0 &&
        !openTokenAddresses.has(item.tokenAddress.toLowerCase())
    )
    .map((item) => {
      const asset = marketData?.availableAssets?.find(
        (a) => a.symbol === item.symbol
      );
      if (!asset) return null;
      return {
        asset,
        side: item.side,
        tokenAddress: item.tokenAddress,
        isOpen: false,
      };
    })
    .filter((position): position is ManifestPosition => !!position)
    .sort((a, b) => a.asset.symbol.localeCompare(b.asset.symbol));

  const filteredOpen = openPositions.filter((position) =>
    matchesFilters(position, sideFilter, searchText)
  );
  const filteredClosed = closedPositions.filter((position) =>
    matchesFilters(position, sideFilter, searchText)
  );

  // Sides already shown as open positions don't need to be scanned again
  const scanRefs: ManifestAssetRef[] = (marketData?.availableAssets ?? [])
    .map((asset) => ({
      symbol: asset.symbol,
      aTokenAddress:
        asset.aTokenAddress &&
        !openTokenAddresses.has(asset.aTokenAddress.toLowerCase())
          ? asset.aTokenAddress
          : undefined,
      variableDebtTokenAddress:
        asset.variableDebtTokenAddress &&
        !openTokenAddresses.has(asset.variableDebtTokenAddress.toLowerCase())
          ? asset.variableDebtTokenAddress
          : undefined,
    }))
    .filter((ref) => ref.aTokenAddress || ref.variableDebtTokenAddress);

  return (
    <>
      <Group justify="space-between" mt={10} mb={5}>
        <Title order={4}>
          <Trans>Interest Accrual History</Trans>
        </Title>
        <Text size="sm" c="dimmed">
          <AbbreviatedEthereumAddress address={currentAddress} />
          {" · "}
          {market.title}
        </Text>
      </Group>

      <Alert
        icon={<FiInfo size="1rem" />}
        color="blue"
        variant="outline"
        mb={15}
      >
        <Trans>
          This accounting is reconstructed from on-chain aToken and variable
          debt token events, so every row corresponds to a real transaction.
          Interest is credited to your balance whenever you interact with a
          reserve; the remainder accrues continuously since your last activity.
          Fiat values use current prices (historical prices are not available).
          This feature is experimental.
        </Trans>
      </Alert>

      <Group justify="space-between" mb={15}>
        <SegmentedControl
          size="xs"
          value={sideFilter}
          onChange={(value) => setSideFilter(value as SideFilter)}
          data={[
            { label: t`All`, value: "ALL" },
            { label: t`Supplied`, value: "SUPPLY" },
            { label: t`Borrowed`, value: "BORROW" },
          ]}
        />
        <TextInput
          size="xs"
          leftSection={<FiSearch />}
          placeholder={t`Filter by asset`}
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
        />
      </Group>

      {filteredOpen.length === 0 && filteredClosed.length === 0 && (
        <Center mt={30} mb={30}>
          <Text c="dimmed">
            {openPositions.length === 0 ? (
              <Trans>
                No supplied or borrowed assets found for this address in this
                market.
              </Trans>
            ) : (
              <Trans>No assets match the current filters.</Trans>
            )}
          </Text>
        </Center>
      )}

      {filteredOpen.map((position) => (
        <AssetLedgerSection
          key={`${position.tokenAddress}:${position.side}`}
          position={position}
          market={market}
          user={resolvedAddress}
        />
      ))}

      {filteredClosed.length > 0 && (
        <>
          <Divider
            label={t`Previously held positions`}
            labelPosition="center"
            mt={25}
            mb={15}
          />
          {filteredClosed.map((position) => (
            <AssetLedgerSection
              key={`${position.tokenAddress}:${position.side}`}
              position={position}
              market={market}
              user={resolvedAddress}
            />
          ))}
        </>
      )}

      <Space h="lg" />

      <ManifestScanSection
        manifest={manifest}
        scanRefs={scanRefs}
        closedCount={closedPositions.length}
      />
    </>
  );
}

type ManifestScanSectionProps = {
  manifest: ReturnType<typeof useAccrualManifest>;
  scanRefs: ManifestAssetRef[];
  closedCount: number;
};

const ManifestScanSection = ({
  manifest,
  scanRefs,
  closedCount,
}: ManifestScanSectionProps) => {
  const { isScanning, scanError, progress, results, startScan } = manifest;

  return (
    <>
      <Divider label={t`Full History`} labelPosition="center" mb={15} />

      {!results && !isScanning && (
        <Center>
          <div style={{ textAlign: "center" }}>
            <Text size="sm" c="dimmed" mb={10}>
              <Trans>
                Scan every reserve in this market to find interest accrued by
                positions that were closed in the past. This checks each token
                contract for your activity and may take a minute.
              </Trans>
            </Text>
            <Button
              leftSection={<FaHistory size={14} />}
              variant="outline"
              onClick={() => startScan(scanRefs)}
              disabled={!scanRefs.length}
            >
              <Trans>Scan Full History</Trans>
            </Button>
          </div>
        </Center>
      )}

      {isScanning && (
        <>
          <Progress
            value={progress.total ? (progress.done / progress.total) * 100 : 0}
            animated
            mb={10}
          />
          <Center>
            <Text size="sm" c="dimmed">
              <Trans>
                Scanning token contracts: {progress.done} of {progress.total}
              </Trans>
            </Text>
          </Center>
        </>
      )}

      {!!scanError.length && (
        <Center>
          <Text size="sm" c="red">
            <Trans>The full history scan failed: {scanError}</Trans>
          </Text>
        </Center>
      )}

      {results && !isScanning && (
        <Center>
          <Text size="sm" c="dimmed">
            {closedCount > 0 ? (
              <Trans>
                Scan complete: found {closedCount} previously held asset
                positions with interest history.
              </Trans>
            ) : (
              <Trans>
                Scan complete: no additional assets with interest history were
                found.
              </Trans>
            )}
          </Text>
        </Center>
      )}
    </>
  );
};

type AssetLedgerSectionProps = {
  position: ManifestPosition;
  market: AaveMarketDataType;
  user: string;
};

const AssetLedgerSection = ({
  position,
  market,
  user,
}: AssetLedgerSectionProps) => {
  const { i18n } = useLingui();
  const { isFetching, fetchError, data } = useAccrualLedger(
    market.id,
    user,
    position.tokenAddress,
    position.side
  );

  const { asset, side, isOpen } = position;
  const { symbol } = asset;

  const accrued = Number(data?.accruedValue ?? "0");
  const pending = Number(data?.pendingValue ?? "0");
  const realized = Number(data?.realizedValue ?? "0");

  // The accrual math over token events is exact, so a negative value indicates a
  // token with non-standard accounting (e.g. GHO's discounted debt) or an RPC
  // inconsistency; hide the values rather than display wrong numbers.
  const isInvalidValue: boolean =
    !!fetchError?.length ||
    (!isFetching &&
      (data?.accruedValue === undefined || accrued < 0 || pending < 0));

  const formatAmount = (value: number): string =>
    formatTokenAmount(value, i18n.locale);

  const signedAmount = (value: number): string => {
    if (value === 0) return "—";
    const sign = value > 0 ? "+" : "−";
    return `${sign}${formatAmount(Math.abs(value))}`;
  };

  const formatDate = (timestamp: number | null): string =>
    timestamp
      ? i18n.date(new Date(timestamp * 1000), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";

  return (
    <Paper withBorder p="md" mb="md">
      <Group justify="space-between" mb={5}>
        <Group gap={8}>
          <TokenIcon symbol={symbol} size="22px" />
          <Text fw={700}>{symbol}</Text>
          {side === "supply" ? (
            <Badge color="blue" radius="sm" variant="light">
              <Trans>Supplied</Trans>
            </Badge>
          ) : (
            <Badge color="orange" radius="sm" variant="light">
              <Trans>Borrowed</Trans>
            </Badge>
          )}
          {!isOpen && (
            <Badge color="gray" radius="sm" variant="outline">
              <Trans>Closed</Trans>
            </Badge>
          )}
        </Group>
        {isFetching ? (
          <Loader type="dots" />
        ) : isInvalidValue ? (
          <Text size="sm" c="dimmed">
            <Trans>Unavailable</Trans>
          </Text>
        ) : (
          <Text size="sm" fw={600}>
            {`${formatAmount(accrued)} ${symbol} `}
            (<LocalizedFiatDisplay valueUSD={accrued * asset.priceInUSD} />)
          </Text>
        )}
      </Group>

      {isFetching && (
        <Text size="xs" c="dimmed">
          <Trans>Loading on-chain interest history...</Trans>
        </Text>
      )}

      {!isFetching && isInvalidValue && (
        <Text size="xs" c="dimmed">
          <Trans>
            The interest history for this asset cannot be displayed. The token
            may use non-standard accounting (e.g. GHO), or the event data could
            not be fetched.
          </Trans>
        </Text>
      )}

      {!isFetching && !isInvalidValue && data && (
        <>
          <Text size="xs" c="dimmed" mb={10}>
            {side === "supply" ? (
              <Trans>
                Total interest earned over the life of this position, of which{" "}
                {formatAmount(realized)} {symbol} was credited during past
                activity and {formatAmount(pending)} {symbol} has accrued since
                the last activity.
              </Trans>
            ) : (
              <Trans>
                Total interest owed over the life of this position, of which{" "}
                {formatAmount(realized)} {symbol} was applied during past
                activity and {formatAmount(pending)} {symbol} has accrued since
                the last activity.
              </Trans>
            )}
          </Text>

          {data.ledger?.length ? (
            <div style={{ overflowX: "auto" }}>
              <Table fz="xs" striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      <Trans>Date</Trans>
                    </Table.Th>
                    <Table.Th>
                      <Trans>Action</Trans>
                    </Table.Th>
                    <Table.Th ta="right">
                      <Trans>Amount</Trans>
                    </Table.Th>
                    <Table.Th ta="right">
                      <Trans>Interest Accrued</Trans>
                    </Table.Th>
                    <Table.Th>
                      <Trans>Tx</Trans>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.ledger.map((row: LedgerRow, index: number) => {
                    const principal = Number(row.principalDelta);
                    const interest = Number(row.interestRealized);
                    return (
                      <Table.Tr key={`${row.blockNumber}-${index}`}>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>
                          {formatDate(row.timestamp)}
                        </Table.Td>
                        <Table.Td>{getActionLabel(row.action)}</Table.Td>
                        <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                          {signedAmount(principal)}
                        </Table.Td>
                        <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                          {interest > 0 ? formatAmount(interest) : "—"}
                        </Table.Td>
                        <Table.Td>
                          {row.txHash && (
                            <Anchor
                              href={getExplorerTxUrl(market, row.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              title={t`View transaction on ${market.explorerName}`}
                              c="dimmed"
                            >
                              <FiExternalLink />
                            </Anchor>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {pending > 0 && (
                    <Table.Tr>
                      <Table.Td>
                        <Text c="dimmed" fs="italic" span size="xs">
                          <Trans>Now</Trans>
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" fs="italic" span size="xs">
                          <Trans>Accruing since last activity</Trans>
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">—</Table.Td>
                      <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                        <Text c="dimmed" fs="italic" span size="xs">
                          {formatAmount(pending)}
                        </Text>
                      </Table.Td>
                      <Table.Td />
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </div>
          ) : (
            <Text size="xs" c="dimmed">
              <Trans>No on-chain events found for this asset.</Trans>
            </Text>
          )}
        </>
      )}
    </Paper>
  );
};
