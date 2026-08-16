import * as React from "react";

import { formatNumber } from "accounting";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  ActionIcon,
  Badge,
  Center,
  Drawer,
  Group,
  Indicator,
  Loader,
  Popover,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useRouter } from "next/router";
import { FaChevronDown, FaInfinity } from "react-icons/fa";
import { RxReset } from "react-icons/rx";

import {
  AaveMarketDataType,
  getHealthFactorColor,
  getIconNameFromMarket,
  markets,
  useAaveData,
} from "../hooks/useAaveData";
import { AbbreviatedEthereumAddress } from "./position/AbbreviatedEthereumAddress";
import classes from "./MarketPicker.module.css";

type MarketFilter = "all" | "positions" | "v3" | "v4";

type MarketRowState = {
  hf: number;
  hasPosition: boolean;
  isFetching: boolean;
  hasError: boolean;
  isCurrent: boolean;
};

/** Drop the redundant version suffix so grouped rows stay short. */
const getMarketShortName = (market: AaveMarketDataType) =>
  market.v4
    ? market.title.replace(/^Ethereum v4\s+/i, "")
    : market.title.replace(/\s+v3$/i, "");

const matchesQuery = (market: AaveMarketDataType, query: string) => {
  if (!query) return true;
  const haystack = `${market.title} ${getMarketShortName(market)} ${
    market.v4 ? "v4 spoke" : "v3"
  }`.toLowerCase();
  return haystack.includes(query);
};

const NetworkIcon = ({
  market,
  size,
}: {
  market?: AaveMarketDataType;
  size: number;
}) => (
  <img
    src={`/icons/networks/${getIconNameFromMarket(market)}.svg`}
    width={size}
    height={size}
    alt=""
    className={classes.rowIcon}
    style={{ width: size, height: size }}
  />
);

const HealthBadge = ({
  hf,
  isFetching,
  hasError,
}: Pick<MarketRowState, "hf" | "isFetching" | "hasError">) => {
  if (isFetching) {
    return (
      <Badge color="gray" radius="sm" variant="light">
        <Loader type="dots" size="xs" color="gray" />
      </Badge>
    );
  }
  if (hasError) {
    return (
      <Badge color="red" radius="sm" variant="outline">
        !
      </Badge>
    );
  }
  if (hf <= -1) return null;
  return (
    <Badge color={getHealthFactorColor(hf)} radius="sm" variant="filled">
      {hf === Infinity ? (
        <Center inline>
          <FaInfinity size={13} style={{ display: "block" }} />
        </Center>
      ) : (
        formatNumber(hf, 2)
      )}
    </Badge>
  );
};

export default function MarketPicker() {
  const router = useRouter();
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<MarketFilter>("all");
  const currentRowRef = React.useRef<HTMLButtonElement | null>(null);
  const isMobile = useMediaQuery("(max-width: 47.99em)", false, {
    getInitialValueInEffect: true,
  });

  const { addressData, currentMarket, setCurrentMarket, currentAddress } =
    useAaveData("");

  const currentMarketData = markets.find(
    (market) => market.id === currentMarket,
  );

  const getRowState = (market: AaveMarketDataType): MarketRowState => {
    const hf = addressData?.[market.id]?.workingData?.healthFactor ?? -1;
    return {
      hf,
      hasPosition: hf > -1,
      isFetching: !!addressData?.[market.id]?.isFetching,
      hasError: !!addressData?.[market.id]?.fetchError?.length,
      isCurrent: currentMarket === market.id,
    };
  };

  const numMarketsWithHF = markets.filter(
    (market) => getRowState(market).hasPosition,
  ).length;

  const normalizedQuery = query.trim().toLowerCase();

  const sortMarkets = (list: AaveMarketDataType[]) =>
    [...list].sort((a, b) => {
      const aState = getRowState(a);
      const bState = getRowState(b);
      if (aState.hasPosition !== bState.hasPosition) {
        return aState.hasPosition ? -1 : 1;
      }
      return getMarketShortName(a).localeCompare(getMarketShortName(b));
    });

  const visibleMarkets = (list: AaveMarketDataType[]) =>
    sortMarkets(
      list.filter((market) => {
        if (!matchesQuery(market, normalizedQuery)) return false;
        if (filter === "positions") return getRowState(market).hasPosition;
        if (filter === "v3") return !market.v4;
        if (filter === "v4") return !!market.v4;
        return true;
      }),
    );

  const v3Markets = visibleMarkets(markets.filter((market) => !market.v4));
  const v4Markets = visibleMarkets(markets.filter((market) => market.v4));
  const positionMarkets =
    filter === "all"
      ? visibleMarkets(
          markets.filter((market) => getRowState(market).hasPosition),
        )
      : [];
  const positionIds = new Set(positionMarkets.map((market) => market.id));

  const groups = [
    {
      key: "positions",
      label: t`Your positions`,
      markets: positionMarkets,
    },
    {
      key: "v3",
      label: t`Aave V3`,
      markets: v3Markets.filter((market) => !positionIds.has(market.id)),
    },
    {
      key: "v4",
      label: t`Aave V4 — Ethereum`,
      markets: v4Markets.filter((market) => !positionIds.has(market.id)),
    },
  ].filter((group) => group.markets.length > 0);

  const closePicker = () => {
    setQuery("");
    setFilter("all");
    close();
  };

  const handleSelectMarket = (marketId: string) => {
    setCurrentMarket(marketId);
    // Reflect the market in the URL so copied links and share click-throughs
    // reopen the same market.
    router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, market: marketId },
      },
      undefined,
      { shallow: true },
    );
    closePicker();
  };

  const handleOpenChange = (nextOpened: boolean) => {
    if (nextOpened) {
      open();
    } else {
      closePicker();
    }
  };

  React.useEffect(() => {
    if (!opened) return;
    currentRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [opened, filter, normalizedQuery]);

  const renderRow = (market: AaveMarketDataType) => {
    const state = getRowState(market);
    return (
      <button
        key={market.id}
        type="button"
        id={market.id}
        ref={state.isCurrent ? currentRowRef : undefined}
        role="option"
        aria-selected={state.isCurrent}
        className={`${classes.row}${state.isCurrent ? ` ${classes.rowCurrent}` : ""}`}
        onClick={() => handleSelectMarket(market.id)}
      >
        <NetworkIcon market={market} size={isMobile ? 28 : 24} />
        <div className={classes.rowBody}>
          <Text
            size="sm"
            fw={state.isCurrent ? 600 : 500}
            className={classes.rowTitle}
          >
            {getMarketShortName(market)}
          </Text>
        </div>
        <div className={classes.rowMeta}>
          <HealthBadge
            hf={state.hf}
            isFetching={state.isFetching}
            hasError={state.hasError}
          />
        </div>
      </button>
    );
  };

  const panel = (
    <div
      className={`${classes.panel} ${
        isMobile ? classes.panelSheet : classes.panelPopover
      }`}
    >
      <div className={classes.toolbar}>
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t`Search markets`}
          aria-label={t`Search markets`}
          size={isMobile ? "md" : "sm"}
          autoFocus={!isMobile}
          mb={8}
          rightSection={
            query.length > 0 && (
              <Tooltip label={t`Clear search`} position="top-end" withArrow>
                <ActionIcon
                  aria-label={t`Clear search`}
                  onClick={() => setQuery("")}
                >
                  <RxReset size={16} style={{ display: "block" }} />
                </ActionIcon>
              </Tooltip>
            )
          }
        />
        <SegmentedControl
          fullWidth
          size="xs"
          value={filter}
          onChange={(value) => setFilter(value as MarketFilter)}
          data={[
            { label: t`All`, value: "all" },
            ...(numMarketsWithHF > 0
              ? [{ label: t`Positions`, value: "positions" }]
              : []),
            { label: "V3", value: "v3" },
            { label: "V4", value: "v4" },
          ]}
        />
        <Text size="xs" c="dimmed" mt={8}>
          {currentAddress ? (
            <Trans>
              Markets for{" "}
              <Text span fw={600} c="dark.0" ff="monospace">
                <AbbreviatedEthereumAddress address={currentAddress} />
              </Text>
            </Trans>
          ) : (
            <Trans>No address found</Trans>
          )}
        </Text>
      </div>

      <div className={classes.list} role="listbox" aria-label={t`Markets`}>
        {groups.length === 0 ? (
          <Text size="sm" c="dimmed" className={classes.empty}>
            <Trans>No markets match that search.</Trans>
          </Text>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div className={classes.groupLabel}>
                <Text size="xs" tt="uppercase" fw={600} c="dimmed" lts={0.4}>
                  {group.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {group.markets.length}
                </Text>
              </div>
              {group.markets.map(renderRow)}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const triggerButton = (
    <UnstyledButton
      className={`${classes.trigger}${opened ? ` ${classes.triggerActive}` : ""}`}
      onClick={toggle}
      aria-haspopup={isMobile ? "dialog" : "listbox"}
      aria-expanded={opened}
      aria-label={t`Select market`}
    >
      <Group gap={7} align="center" wrap="nowrap">
        <NetworkIcon market={currentMarketData} size={20} />
        <Text fw={500} size="sm" className={classes.triggerLabel}>
          {currentMarketData ? getMarketShortName(currentMarketData) : ""}
        </Text>
        {currentMarketData && (
          <Badge
            size="xs"
            variant="light"
            color={currentMarketData.v4 ? "brand" : "gray"}
            radius="sm"
            tt="none"
          >
            {currentMarketData.v4 ? "V4" : "V3"}
          </Badge>
        )}
        <FaChevronDown size={10} style={{ display: "block" }} />
      </Group>
    </UnstyledButton>
  );

  return (
    <Indicator
      inline
      label={`${numMarketsWithHF}`}
      size={12}
      disabled={
        !markets.some(
          (market) =>
            getRowState(market).hasPosition && market.id !== currentMarket,
        )
      }
    >
      {isMobile ? (
        <>
          {triggerButton}
          <Drawer
            opened={opened}
            onClose={closePicker}
            position="bottom"
            size="85%"
            radius="lg"
            title={t`Select market`}
            overlayProps={{ backgroundOpacity: 0.6, blur: 4 }}
            classNames={{
              content: classes.drawerContent,
              header: classes.drawerHeader,
              body: classes.drawerBody,
            }}
          >
            {panel}
          </Drawer>
        </>
      ) : (
        <Popover
          opened={opened}
          onChange={handleOpenChange}
          position="bottom-end"
          width={360}
          shadow="md"
          radius="md"
          withinPortal
        >
          <Popover.Target popupType="listbox">{triggerButton}</Popover.Target>
          <Popover.Dropdown className={classes.dropdown}>
            {panel}
          </Popover.Dropdown>
        </Popover>
      )}
    </Indicator>
  );
}
