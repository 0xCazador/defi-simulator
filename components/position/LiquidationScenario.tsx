import { useMemo, useState } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Flex,
  Popover,
  Text,
  Tooltip,
  Transition,
} from "@mantine/core";
import { BsChevronDown, BsChevronUp } from "react-icons/bs";
import { FiAlertTriangle } from "react-icons/fi";
import { ImmutableObject } from "@hookstate/core";

import {
  AaveHealthFactorData,
  AssetDetails,
  HealthFactorData,
  getCalculatedLiquidationScenario,
  markets,
  useAaveData,
} from "../../hooks/useAaveData";
import { buildLiquidationPayload } from "../../utils/shareMint";
import TokenIcon from "../TokenIcon";
import LocalizedFiatDisplay from "../LocalizedFiatDisplay";
import ShareButton from "../ShareButton";

type LiquidationScenarioProps = {
  data: ImmutableObject<HealthFactorData>;
  applyLiquidationScenario: () => void;
};

export const LiquidationScenario = ({
  data,
  applyLiquidationScenario,
}: LiquidationScenarioProps) => {
  const [showLiquidation, setShowLiquidation] = useState(true);
  const { currentAddress, currentMarket } = useAaveData("");

  // Fingerprint the current market's position so other markets finishing their
  // fetch (which re-renders this tree via the shared store) do not re-run the
  // iterative liquidation solver on the main thread.
  const scenarioFingerprint = [
    data?.isFetching ? "fetching" : "ready",
    data?.marketReferenceCurrencyPriceInUSD,
    data?.workingData?.healthFactor,
    ...(data?.workingData?.userReservesData ?? []).map(
      (item) =>
        `${item.asset.symbol}:${item.underlyingBalance}:${item.asset.priceInUSD}:${item.usageAsCollateralEnabledOnUser}`,
    ),
    ...(data?.workingData?.userBorrowsData ?? []).map(
      (item) =>
        `${item.asset.symbol}:${item.totalBorrows}:${item.asset.priceInUSD}`,
    ),
  ].join("|");

  const scenario: AssetDetails[] = useMemo(() => {
    if (data?.isFetching || !data?.workingData) return [];
    return getCalculatedLiquidationScenario(
      data.workingData as AaveHealthFactorData,
      data.marketReferenceCurrencyPriceInUSD,
    );
    // scenarioFingerprint is the intentional dep: equal numbers/balances skip
    // the solver even when hookstate hands us a new object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioFingerprint]);

  if (data?.isFetching) return null;

  const noScenarioLabel = <Trans>No Liquidation Scenario Available</Trans>;

  if (!scenario?.length)
    return (
      <Divider
        my="sm"
        variant="dashed"
        label={noScenarioLabel}
        labelPosition="center"
      />
    );

  return (
    <>
      <Divider
        variant="dashed"
        my="sm"
        labelPosition="center"
        label={
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            onClick={() => setShowLiquidation(!showLiquidation)}
            rightSection={showLiquidation ? <BsChevronUp /> : <BsChevronDown />}
            aria-expanded={showLiquidation}
          >
            <Trans>Price Liquidation Scenario</Trans>
          </Button>
        }
      />
      <Transition
        mounted={showLiquidation}
        transition="slide-down"
        duration={400}
        exitDuration={0}
        timingFunction="ease"
      >
        {(styles) => (
          <Flex
            style={styles}
            gap="sm"
            justify="center"
            align="center"
            direction="row"
            wrap="wrap"
          >
            <Popover width="300px" position="bottom" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon aria-label={t`Price Liquidation Scenario`}>
                  <FiAlertTriangle size={18} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Trans>
                  <Text size="sm">
                    This scenario shows one set of supplied-asset price drops
                    that would bring the position to its liquidation threshold,
                    with stable assets held at their present value. Treat it as
                    illustrative, not predictive: liquidation risk also shifts
                    with interest accruing over time, oracle prices, and risk
                    parameters that Aave governance can change at any time.
                    <a
                      href="https://aave.com/help/borrowing/liquidations"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--mantine-color-dark-0)" }}
                    >
                      {" Learn more about health factor & liquidations"}
                    </a>
                    .
                  </Text>
                </Trans>
              </Popover.Dropdown>
            </Popover>
            {scenario.map((liqAsset) => {
              const avatar = (
                <TokenIcon
                  symbol={liqAsset.symbol}
                  size="24px"
                  alt={`Logo for ${liqAsset.symbol}`}
                />
              );

              return (
                <Tooltip
                  key={liqAsset.symbol}
                  label={t`${liqAsset.symbol} liquidation price`}
                  withArrow
                >
                  <Badge
                    pl={0}
                    size="lg"
                    radius="lg"
                    mr="sm"
                    variant="light"
                    color="gray"
                    c="dimmed"
                    leftSection={avatar}
                  >
                    <LocalizedFiatDisplay valueUSD={liqAsset.priceInUSD} />
                  </Badge>
                </Tooltip>
              );
            })}
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              onClick={applyLiquidationScenario}
            >
              <Trans>Apply</Trans>
            </Button>
            <ShareButton
              label={t`Share liquidation scenario`}
              buildPayload={() => {
                const market = markets.find((m) => m.id === currentMarket);
                if (!market || !currentAddress || !scenario?.length)
                  return null;
                return buildLiquidationPayload(
                  data,
                  scenario,
                  market,
                  currentAddress,
                );
              }}
            />
          </Flex>
        )}
      </Transition>
      {showLiquidation && <Divider my="sm" variant="dashed" />}
    </>
  );
};

export default LiquidationScenario;
