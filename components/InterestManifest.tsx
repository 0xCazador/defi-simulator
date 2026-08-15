import { useId, useState } from "react";
import { ethers } from "ethers";
import { Plural, t, Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { ImmutableObject } from "@hookstate/core";
import {
  ActionIcon,
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
  Popover,
  Progress,
  SegmentedControl,
  Space,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { FaChevronRight, FaCopy, FaHistory } from "react-icons/fa";
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
          Interest history is only available for real on-chain addresses, not
          simulated sandbox positions.
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
  const [showCopied, setShowCopied] = useState(false);

  // Copies the resolved hex address (not the ENS name), which is what block
  // explorers and wallets expect. Confirmation only shows if the write
  // actually succeeded (the Clipboard API rejects in unfocused documents).
  const handleCopyAddress = () => {
    navigator.clipboard
      .writeText(user)
      .then(() => {
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2500);
      })
      .catch(() => {});
  };

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
        <Group gap={8}>
          <Title order={4}>
            <Trans>Aave Interest Accrual</Trans>
          </Title>
          <Badge variant="outline" color="yellow" size="xs" radius="sm">
            <Trans>Experimental</Trans>
          </Badge>
        </Group>
        <Group gap={2}>
          <Text size="sm" c="dimmed">
            <AbbreviatedEthereumAddress address={currentAddress} />
            {" · "}
            {market.title}
          </Text>
          <Tooltip
            label={
              showCopied
                ? t`Address copied to clipboard!`
                : t`Copy address to clipboard`
            }
            opened={showCopied ? true : undefined}
            color={showCopied ? "green" : undefined}
            withArrow
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label={t`Copy address to clipboard`}
              onClick={handleCopyAddress}
            >
              <FaCopy size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t`View address on ${market.explorerName}`} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              component="a"
              href={market.explorer.replace("{{ADDRESS}}", user)}
              target="_blank"
              rel="noreferrer"
              aria-label={t`View address on ${market.explorerName}`}
            >
              <FiExternalLink size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* The one-line caption keeps the page scannable; the full explanation
          lives in the popover so no information is actually lost. */}
      <Text fz="xs" c="dimmed" mb={12}>
        <Trans>
          Reconstructed from on-chain token events, priced at current rates.
        </Trans>{" "}
        <Popover width={320} withArrow shadow="md">
          <Popover.Target>
            <Anchor component="button" type="button" fz="xs">
              <Trans>How it works</Trans>
            </Anchor>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">
              <Trans>
                Interest history is reconstructed from on-chain aToken and
                variable debt token events, so every row corresponds to a real
                transaction. Interest is credited to the balance whenever the
                address interacts with a reserve; the remainder accrues
                continuously since the last activity. Fiat values use current
                prices (historical prices are not available).
              </Trans>
            </Text>
          </Popover.Dropdown>
        </Popover>
      </Text>

      {allPositions.length > 0 && (
        <InterestSummary
          positions={allPositions}
          ledgers={ledgers}
          manifest={manifest}
          scanRefs={scanRefs}
        />
      )}

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
 *
 * Net interest is the headline figure — it gets the large type and the card's
 * tint follows its sign — with earned/paid as supporting stats.
 */
const InterestSummary = ({
  positions,
  ledgers,
  manifest,
  scanRefs,
}: InterestSummaryProps) => {
  const { i18n } = useLingui();
  const hasScanned = !!manifest.results;
  const pastCount = positions.filter((position) => !position.isOpen).length;

  // Earliest first-principal-event across the positions in scope: the date
  // interest started accruing for this address in this market.
  const sinceTimestamp = positions.reduce<number | null>(
    (earliest, position) => {
      const state = ledgers.get(
        getPositionKey(position.tokenAddress, position.side)
      );
      const since = state?.data?.sinceTimestamp ?? null;
      if (since === null) return earliest;
      return earliest === null ? since : Math.min(earliest, since);
    },
    null
  );

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
  // eslint-disable-next-line no-nested-ternary
  const netTone =
    net > 0 ? classes.earned : net < 0 ? classes.paid : classes.neutral;
  // eslint-disable-next-line no-nested-ternary
  const cardTone =
    net > 0
      ? classes.summaryCardPositive
      : net < 0
      ? classes.summaryCardNegative
      : "";

  const sideStat = (label: React.ReactNode, valueUSD: number, tone: string) => (
    <div>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      {totals.isLoading ? (
        <Loader type="dots" size="sm" mt={6} />
      ) : (
        <Text className={`${classes.sideStatValue} ${tone}`}>
          <LocalizedFiatDisplay valueUSD={valueUSD} />
        </Text>
      )}
    </div>
  );

  return (
    <Paper
      withBorder
      p="md"
      mb="md"
      className={`${classes.summaryCard} ${cardTone}`}
    >
      <div className={classes.summaryLayout}>
        <div>
          <Text fz="xs" c="dimmed" tt="uppercase" lts={0.5}>
            <Trans>Net interest</Trans>
            {sinceTimestamp !== null && !totals.isLoading && (
              <>
                {" · "}
                <Trans>
                  since{" "}
                  {i18n.date(new Date(sinceTimestamp * 1000), {
                    dateStyle: "medium",
                  })}
                </Trans>
              </>
            )}
          </Text>
          {totals.isLoading ? (
            <Loader type="dots" size="sm" mt={6} />
          ) : (
            <Text className={`${classes.netValue} ${netTone}`}>
              {net > 0 ? "+" : ""}
              <LocalizedFiatDisplay valueUSD={net} />
            </Text>
          )}
        </div>
        <div className={classes.sideStats}>
          {sideStat(<Trans>Earned</Trans>, totals.earned, classes.earned)}
          {sideStat(<Trans>Paid</Trans>, totals.paid, classes.paid)}
        </div>
      </div>

      {totals.unavailable > 0 && !totals.isLoading && (
        <Text fz="xs" c="dimmed" mt={8}>
          <Plural
            value={totals.unavailable}
            one="# position excluded (marked unavailable below)."
            other="# positions excluded (marked unavailable below)."
          />
        </Text>
      )}

      <Space h="sm" />

      <Group justify="space-between" gap="xs">
        <Text fz="xs" c="dimmed" className={classes.scopeNote}>
          {hasScanned ? (
            <Plural
              value={pastCount}
              _0="All positions covered — no closed positions found."
              one="All positions covered, including # closed position."
              other="All positions covered, including # closed positions."
            />
          ) : (
            <Trans>
              Current positions only — closed positions aren&apos;t included
              yet.
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
                Scan every reserve in this market for interest from positions
                closed in the past. This may take a minute.
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
                Scanning {progress.done} of {progress.total}
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
              _0="Scan complete — no closed positions found."
              one="Scan complete — found # closed position."
              other="Scan complete — found # closed positions."
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
        {/* Wraps on narrow screens: large amounts drop to their own right-
            aligned line instead of crushing the symbol and badges. */}
        <Group justify="space-between" gap="sm">
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
                {data?.sinceTimestamp != null && (
                  <>
                    {" · "}
                    <Trans>
                      since{" "}
                      {i18n.date(new Date(data.sinceTimestamp * 1000), {
                        dateStyle: "medium",
                      })}
                    </Trans>
                  </>
                )}
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
                      Lifetime interest earned: {formatAmount(realized)}{" "}
                      {symbol} credited in past activity ·{" "}
                      {formatAmount(pending)} {symbol} accruing since.
                    </Trans>
                  ) : (
                    <Trans>
                      Lifetime interest owed: {formatAmount(realized)} {symbol}{" "}
                      applied in past activity · {formatAmount(pending)}{" "}
                      {symbol} accruing since.
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
