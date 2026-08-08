import { useState } from "react";
import { Trans, t } from "@lingui/macro";
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
} from "../../hooks/useAaveData";
import TokenIcon from "../TokenIcon";
import LocalizedFiatDisplay from "../LocalizedFiatDisplay";

type LiquidationScenarioProps = {
  data: ImmutableObject<HealthFactorData>;
  applyLiquidationScenario: () => void;
};

export const LiquidationScenario = ({
  data,
  applyLiquidationScenario,
}: LiquidationScenarioProps) => {
  const [showLiquidation, setShowLiquidation] = useState(true);

  if (data?.isFetching) return null;

  const scenario: AssetDetails[] = getCalculatedLiquidationScenario(
    data?.workingData as AaveHealthFactorData,
    data?.marketReferenceCurrencyPriceInUSD
  );

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
            <Popover width="250px" position="bottom" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon aria-label={t`Price Liquidation Scenario`}>
                  <FiAlertTriangle size={18} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Trans>
                  <Text size="sm">
                    The price liquidation scenario represents supplied asset
                    prices slightly greater than the prices that could subject
                    the position to liquidation. Stable assets are not included
                    in this scenario and are assumed to maintain their present
                    value. Many factors affect liquidation. This scenario is
                    only one example for reference. Many different scenarios can
                    trigger liquidation.
                    <a
                      href="https://docs.aave.com/faq/liquidations"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--mantine-color-dark-0)" }}
                    >
                      {" Read more here"}
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
          </Flex>
        )}
      </Transition>
      {showLiquidation && <Divider my="sm" variant="dashed" />}
    </>
  );
};

export default LiquidationScenario;
