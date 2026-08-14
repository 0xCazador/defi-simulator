import { useId, useState } from "react";
import { ethers } from "ethers";
import { Plural, t, Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { ImmutableObject } from "@hookstate/core";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Collapse,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Space,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { FaChevronRight, FaHistory } from "react-icons/fa";
import { FiExternalLink, FiInfo, FiSearch } from "react-icons/fi";

import {
  AaveMarketDataType,
  AssetDetails,
  HealthFactorData,
  markets,
  useAaveData,
} from "../hooks/useAaveData";
import {
  AccrualLedgerState,
  getPositionKey,
  useAccrualLedgers,
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
import classes from "./InterestManifest.module.css";

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

/**
 * The accrual math over token events is exact, so a negative total means the
 * token uses non-standard accounting (e.g. GHO's discounted debt) or the event
 * data came back inconsistent. Those values are hidden rather than shown wrong.
 */
const isLedgerUnusable = (state: AccrualLedgerState): boolean => {
  if (state.fetchError.length) return true;
  if (state.isFetching) return false;
  if (state.data?.accruedValue === undefined) return true;
  return (
    Number(state.data.accruedValue) < 0 ||
    Number(state.data.pendingValue ?? "0") < 0
  );
};

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

  const marketData = addressData?.[currentMarket];
  const market = markets.find(
    (m) => m.id === currentMarket
  ) as AaveMarketDataType;
  const resolvedAddress: string = marketData?.resolvedAddress ?? "";

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

  return (
    <ManifestContent
      market={market}
      marketData={marketData}
      user={resolvedAddress}
      currentAddress={currentAddress}
    />
  );
}

type ManifestContentProps = {
  market: AaveMarketDataType;
  marketData: ImmutableObject<HealthFactorData>;
  /** the resolved on-chain address whose events are read */
  user: string;
  /** the address as the user entered it (may be an ENS name) */
  currentAddress: string;
};

const ManifestContent = ({
  market,
  marketData,
  user,
  currentAddress,
}: ManifestContentProps) => {
  const [sideFilter, setSideFilter] = useState<SideFilter>("ALL");
  const [searchText, setSearchText] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const manifest = useAccrualManifest(market.id, user);

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

  // Empty until the full-history scan completes, so this is the summary's
  // scope in both states: current positions only, then everything once scanned.
  const allPositions = [...openPositions, ...closedPositions];

  const ledgers = useAccrualLedgers(
    market.id,
    user,
    allPositions.map((position) => ({
      tokenAddress: position.tokenAddress,
      side: position.side,
    }))
  );

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

  const visibleKeys = [...filteredOpen, ...filteredClosed].map((position) =>
    getPositionKey(position.tokenAddress, position.side)
  );
  const areAllExpanded =
    visibleKeys.length > 0 && visibleKeys.every((key) => expandedKeys.has(key));

  const toggleAll = () =>
    setExpandedKeys(areAllExpanded ? new Set() : new Set(visibleKeys));

  const togglePosition = (key: string) =>
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderSection = (position: ManifestPosition) => {
    const key = getPositionKey(position.tokenAddress, position.side);
    return (
      <AssetLedgerSection
        key={key}
        position={position}
        market={market}
        state={ledgers.get(key) ?? { isFetching: true, fetchError: "" }}
        isExpanded={expandedKeys.has(key)}
        onToggle={() => togglePosition(key)}
      />
    );
  };

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

      {allPositions.length > 0 && (
        <InterestSummary
          positions={allPositions}
          ledgers={ledgers}
          manifest={manifest}
          scanRefs={scanRefs}
        />
      )}

      <Alert
        icon={<FiInfo size="1rem" />}
        color="blue"
        variant="outline"
        mb={15}
      >
        <Trans>
          This accounting is reconstructed from on-chain aToken and variable
          debt token events, so every row corresponds to a real transaction.
          Interest is credited to the balance whenever the address interacts
          with a reserve; the remainder accrues continuously since the last
          activity. Fiat values use current prices (historical prices are not
          available). This feature is experimental.
        </Trans>
      </Alert>

      <Group justify="space-between" mb={15} gap="xs">
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
        <Group gap="xs">
          <TextInput
            size="xs"
            leftSection={<FiSearch />}
            placeholder={t`Filter by asset`}
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
          />
          <Button
            size="compact-sm"
            variant="subtle"
            color="gray"
            onClick={toggleAll}
            disabled={!visibleKeys.length}
          >
            {areAllExpanded ? (
              <Trans>Collapse all</Trans>
            ) : (
              <Trans>Expand all</Trans>
            )}
          </Button>
        </Group>
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

      {filteredOpen.map(renderSection)}

      {filteredClosed.length > 0 && (
        <>
          <Divider
            label={t`Previously held positions`}
            labelPosition="center"
            mt={25}
            mb={15}
          />
          {filteredClosed.map(renderSection)}
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
};

type InterestSummaryProps = {
  /** every position in scope: current ones, plus closed ones once scanned */
  positions: ManifestPosition[];
  ledgers: Map<string, AccrualLedgerState>;
  manifest: ReturnType<typeof useAccrualManifest>;
  scanRefs: ManifestAssetRef[];
};

/**
 * Totals the interest across the positions in scope. That is only the current
 * positions until the full-history scan runs, since finding closed ones is
 * RPC-heavy and therefore opt-in; afterwards the totals cover everything.
 */
const InterestSummary = ({
  positions,
  ledgers,
  manifest,
  scanRefs,
}: InterestSummaryProps) => {
  const hasScanned = !!manifest.results;
  const pastCount = positions.filter((position) => !position.isOpen).length;

  const totals = positions.reduce(
    (accumulator, position) => {
      const state = ledgers.get(
        getPositionKey(position.tokenAddress, position.side)
      );
      if (!state || state.isFetching) {
        return { ...accumulator, isLoading: true };
      }
      if (isLedgerUnusable(state)) {
        return { ...accumulator, unavailable: accumulator.unavailable + 1 };
      }
      const valueUSD =
        Number(state.data?.accruedValue ?? "0") * position.asset.priceInUSD;
      return position.side === "supply"
        ? { ...accumulator, earned: accumulator.earned + valueUSD }
        : { ...accumulator, paid: accumulator.paid + valueUSD };
    },
    { earned: 0, paid: 0, unavailable: 0, isLoading: false }
  );

  const net = totals.earned - totals.paid;

  const stat = (label: React.ReactNode, valueUSD: number, tone: string) => (
    <div>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      {totals.isLoading ? (
        <Loader type="dots" size="sm" mt={6} />
      ) : (
        <Text className={`${classes.summaryValue} ${tone}`}>
          <LocalizedFiatDisplay valueUSD={valueUSD} />
        </Text>
      )}
    </div>
  );

  return (
    <Paper withBorder p="md" mb="md" className={classes.summaryCard}>
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="md">
        {stat(<Trans>Interest earned</Trans>, totals.earned, classes.earned)}
        {stat(<Trans>Interest paid</Trans>, totals.paid, classes.paid)}
        {stat(
          <Trans>Net interest</Trans>,
          net,
          // eslint-disable-next-line no-nested-ternary
          net > 0 ? classes.earned : net < 0 ? classes.paid : classes.neutral
        )}
      </SimpleGrid>

      {totals.unavailable > 0 && !totals.isLoading && (
        <Text fz="xs" c="dimmed" mt={8}>
          <Plural
            value={totals.unavailable}
            one="# position could not be included; it is marked unavailable below."
            other="# positions could not be included; they are marked unavailable below."
          />
        </Text>
      )}

      <Space h="sm" />

      <Group justify="space-between" gap="xs">
        <Text fz="xs" c="dimmed" className={classes.scopeNote}>
          {hasScanned ? (
            <Plural
              value={pastCount}
              _0="Covers every asset this address has supplied or borrowed in this market. The full history scan found no closed positions."
              one="Covers every asset this address has supplied or borrowed in this market, including # position that has since been closed."
              other="Covers every asset this address has supplied or borrowed in this market, including # positions that have since been closed."
            />
          ) : (
            <Trans>
              Covers only the assets currently supplied or borrowed in this
              market. Interest from assets that have since been fully withdrawn
              or repaid is not included.
            </Trans>
          )}
        </Text>

        {manifest.isScanning && (
          <Group gap={6} wrap="nowrap">
            <Loader type="dots" size="xs" />
            <Text fz="xs" c="dimmed">
              <Trans>
                Scanning {manifest.progress.done} of {manifest.progress.total}
              </Trans>
            </Text>
          </Group>
        )}

        {!manifest.isScanning && !hasScanned && (
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<FaHistory size={11} />}
            onClick={() => manifest.startScan(scanRefs)}
            disabled={!scanRefs.length}
          >
            <Trans>Scan past assets</Trans>
          </Button>
        )}
      </Group>
    </Paper>
  );
};

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
                contract for activity by this address and may take a minute.
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
            <Plural
              value={closedCount}
              _0="Scan complete: no additional assets with interest history were found."
              one="Scan complete: found # previously held asset position with interest history."
              other="Scan complete: found # previously held asset positions with interest history."
            />
          </Text>
        </Center>
      )}
    </>
  );
};

type AssetLedgerSectionProps = {
  position: ManifestPosition;
  market: AaveMarketDataType;
  state: AccrualLedgerState;
  isExpanded: boolean;
  onToggle: () => void;
};

const AssetLedgerSection = ({
  position,
  market,
  state,
  isExpanded,
  onToggle,
}: AssetLedgerSectionProps) => {
  const { i18n } = useLingui();
  const panelId = useId();
  // Collapse keeps its children mounted, so the ledger table is only built
  // once a section has actually been opened. Latching (rather than unmounting
  // on close) keeps the closing animation from collapsing over empty space.
  const [hasBeenExpanded, setHasBeenExpanded] = useState(isExpanded);
  if (isExpanded && !hasBeenExpanded) setHasBeenExpanded(true);

  const { isFetching, data } = state;

  const { asset, side, isOpen } = position;
  const { symbol } = asset;

  const accrued = Number(data?.accruedValue ?? "0");
  const pending = Number(data?.pendingValue ?? "0");
  const realized = Number(data?.realizedValue ?? "0");
  const isInvalidValue = isLedgerUnusable(state);
  const eventCount = data?.ledger?.length ?? 0;

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
    <Paper withBorder p="md" mb="sm">
      <UnstyledButton
        className={classes.assetHeader}
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
      >
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap={8} wrap="nowrap">
            <FaChevronRight
              size={11}
              className={`${classes.chevron}${
                isExpanded ? ` ${classes.chevronOpen}` : ""
              }`}
            />
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
            {!isFetching && !isInvalidValue && eventCount > 0 && (
              <Text fz="xs" c="dimmed" visibleFrom="sm">
                <Plural value={eventCount} one="# event" other="# events" />
              </Text>
            )}
          </Group>

          <div className={classes.amountBlock}>
            {isFetching ? (
              <Loader type="dots" />
            ) : isInvalidValue ? (
              <Text size="sm" c="dimmed">
                <Trans>Unavailable</Trans>
              </Text>
            ) : (
              <>
                <Text
                  className={`${classes.interestValue} ${
                    side === "supply" ? classes.earned : classes.paid
                  }`}
                >
                  {`${formatAmount(accrued)} ${symbol}`}
                </Text>
                <Text fz="xs" c="dimmed">
                  <LocalizedFiatDisplay valueUSD={accrued * asset.priceInUSD} />
                </Text>
              </>
            )}
          </div>
        </Group>
      </UnstyledButton>

      <Collapse in={isExpanded} id={panelId}>
        {hasBeenExpanded && (
          <>
            <Space h="sm" />

            {isFetching && (
              <Text size="xs" c="dimmed">
                <Trans>Loading on-chain interest history...</Trans>
              </Text>
            )}

            {!isFetching && isInvalidValue && (
              <Text size="xs" c="dimmed">
                <Trans>
                  The interest history for this asset cannot be displayed. The
                  token may use non-standard accounting (e.g. GHO), or the event
                  data could not be fetched.
                </Trans>
              </Text>
            )}

            {!isFetching && !isInvalidValue && data && (
              <>
                <Text size="xs" c="dimmed" mb={10}>
                  {side === "supply" ? (
                    <Trans>
                      Total interest earned over the life of this position, of
                      which {formatAmount(realized)} {symbol} was credited
                      during past activity and {formatAmount(pending)} {symbol}{" "}
                      has accrued since the last activity.
                    </Trans>
                  ) : (
                    <Trans>
                      Total interest owed over the life of this position, of
                      which {formatAmount(realized)} {symbol} was applied during
                      past activity and {formatAmount(pending)} {symbol} has
                      accrued since the last activity.
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
                              <Table.Td
                                ta="right"
                                style={{ whiteSpace: "nowrap" }}
                              >
                                {signedAmount(principal)}
                              </Table.Td>
                              <Table.Td
                                ta="right"
                                style={{ whiteSpace: "nowrap" }}
                              >
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
                            <Table.Td
                              ta="right"
                              style={{ whiteSpace: "nowrap" }}
                            >
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
          </>
        )}
      </Collapse>
    </Paper>
  );
};
