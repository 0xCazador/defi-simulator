import { ReactElement, RefCallback } from "react";
import { formatNumber } from "accounting";
import { Trans } from "@lingui/react/macro";
import { Center, Flex, Group, Popover, SimpleGrid, Text } from "@mantine/core";
import { FaInfinity } from "react-icons/fa";
import { ImmutableObject } from "@hookstate/core";

import { t } from "@lingui/core/macro";

import {
  HealthFactorData,
  getHealthFactorColor,
  markets,
  useAaveData,
} from "../../hooks/useAaveData";
import { buildPositionPayload } from "../../utils/shareMint";
import LocalizedFiatDisplay from "../LocalizedFiatDisplay";
import ShareButton from "../ShareButton";
import { HealthFactorSkeleton } from "./HealthFactorSkeleton";
import { ResetMarketButton } from "./ResetMarketButton";
import { PositionStat } from "./PositionStat";
import classes from "./Position.module.css";

type HealthFactorSummaryProps = {
  data: ImmutableObject<HealthFactorData>;
  summaryRef: RefCallback<HTMLDivElement | null>;
};

/**
 * Sticky "hero" summary of the position: large semantically-colored health
 * factor on the left, key fiat stats on the right. Stays pinned (translucent
 * + blurred) while the asset lists scroll underneath.
 */
export const HealthFactorSummary = ({
  data,
  summaryRef,
}: HealthFactorSummaryProps) => {
  const { currentAddress, currentMarket } = useAaveData("");

  if (data?.isFetching) return <HealthFactorSkeleton animate />;

  if (!data) {
    return (
      <Center mt={30}>
        <Text>
          <Trans>
            Something happened, we&apos;re not able to load the address debt
            position data right now. Try again later.
          </Trans>
        </Text>
      </Center>
    );
  }

  const addressHasPosition: boolean =
    (data.fetchedData?.healthFactor || -1) > -1;

  const originalHealthFactorDisplayable: string = formatNumber(
    Math.max(data.fetchedData?.healthFactor || 0, 0),
    2,
  );

  const hfColor: string = getHealthFactorColor(
    data.workingData?.healthFactor || 0,
  );

  const healthFactorElem: ReactElement =
    data.workingData?.healthFactor === Infinity ? (
      <Center inline>
        <FaInfinity size={30} style={{ paddingTop: "8px" }} />
      </Center>
    ) : (
      <span>
        {formatNumber(Math.max(data.workingData?.healthFactor || 0, 0), 2)}
      </span>
    );
  const healthFactorDiffers: boolean =
    addressHasPosition &&
    data.workingData?.healthFactor?.toFixed(2) !==
      data.fetchedData?.healthFactor?.toFixed(2);

  const originalTotalBorrowsUSD: number =
    data.fetchedData?.totalBorrowsUSD ?? 0;
  const totalBorrowsUSD: number = data.workingData?.totalBorrowsUSD ?? 0;
  const totalBorrowsDiffers: boolean =
    addressHasPosition &&
    data.fetchedData?.totalBorrowsUSD?.toFixed(2) !==
      data.workingData?.totalBorrowsUSD?.toFixed(2);

  const originalAvailableBorrowsUSD: number = Math.max(
    data.fetchedData?.availableBorrowsUSD ?? 0,
    0,
  );

  const availableBorrowsUSD: number = Math.max(
    data.workingData?.availableBorrowsUSD ?? 0,
    0,
  );

  const availableBorrowsDiffers: boolean =
    addressHasPosition &&
    data.fetchedData?.availableBorrowsUSD?.toFixed(2) !==
      data.workingData?.availableBorrowsUSD?.toFixed(2);

  const originalTotalCollateralUSD: number =
    data.fetchedData?.userReservesData.reduce(
      (acc, item) => acc + item.underlyingBalanceUSD,
      0,
    ) ?? 0;
  const totalCollateralUSD: number =
    data.workingData?.userReservesData.reduce(
      (acc, item) => acc + item.underlyingBalanceUSD,
      0,
    ) ?? 0;

  const totalCollateralDiffers: boolean =
    addressHasPosition &&
    originalTotalCollateralUSD?.toFixed(2) !== totalCollateralUSD?.toFixed(2);

  const originalNetValueUSD: number =
    originalTotalCollateralUSD - (data.fetchedData?.totalBorrowsUSD ?? 0);

  const netValueUSD: number =
    totalCollateralUSD - (data.workingData?.totalBorrowsUSD ?? 0);

  const netValueUSDDiffers: boolean =
    addressHasPosition &&
    (
      originalTotalCollateralUSD - (data.fetchedData?.totalBorrowsUSD ?? 0)
    ).toFixed(2) !==
      (totalCollateralUSD - (data.workingData?.totalBorrowsUSD ?? 0)).toFixed(
        2,
      );

  return (
    <div ref={summaryRef} className={classes.heroWrapper}>
      <div className={classes.heroCard}>
        <Flex
          justify="space-between"
          align="center"
          wrap="wrap"
          columnGap="xl"
          rowGap="md"
        >
          <div className={classes.hfBlock}>
            <Group gap={4} align="center">
              <Popover width="300px" withArrow shadow="md">
                <Popover.Target>
                  <Text span fz="sm" className={classes.statLabel}>
                    <Trans>Health Factor</Trans>
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Trans>
                    <Text size="sm">
                      The position is subject to liquidation when the Health
                      Factor drops below 1.
                    </Text>
                  </Trans>
                </Popover.Dropdown>
              </Popover>
              <ResetMarketButton />
              <ShareButton
                label={t`Share position stats`}
                buildPayload={() => {
                  const market = markets.find((m) => m.id === currentMarket);
                  if (!market || !currentAddress || !data?.workingData)
                    return null;
                  return buildPositionPayload(data, market, currentAddress);
                }}
              />
            </Group>
            <Group gap="sm" align="baseline" wrap="nowrap">
              {healthFactorDiffers && (
                <Text span c="dimmed" fz="xl" className={classes.hfValue}>
                  {`${originalHealthFactorDisplayable}`} ➔
                </Text>
              )}
              <Text
                span
                fz={38}
                fw={700}
                c={`${hfColor}.4`}
                className={classes.hfValue}
              >
                {healthFactorElem}
              </Text>
            </Group>
          </div>

          <SimpleGrid
            className={classes.statsGrid}
            cols={{ base: 2, sm: 4 }}
            spacing="lg"
            verticalSpacing="sm"
          >
            <PositionStat
              label={<Trans>{"Total Borrowed: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Total Borrowed refers to the sum of all assets borrowed,
                    expressed in the selected fiat currency.
                  </Text>
                </Trans>
              }
              differs={totalBorrowsDiffers}
              original={
                <LocalizedFiatDisplay
                  valueUSD={originalTotalBorrowsUSD}
                  hideFractionDigits
                />
              }
            >
              <LocalizedFiatDisplay
                valueUSD={totalBorrowsUSD}
                hideFractionDigits
              />
            </PositionStat>

            <PositionStat
              label={<Trans>{"Available to Borrow: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Available to Borrow represents the total borrowing power
                    available to the position, expressed in the selected fiat
                    currency.
                  </Text>
                </Trans>
              }
              differs={availableBorrowsDiffers}
              original={
                <LocalizedFiatDisplay
                  valueUSD={originalAvailableBorrowsUSD}
                  hideFractionDigits
                />
              }
            >
              <LocalizedFiatDisplay
                valueUSD={availableBorrowsUSD}
                hideFractionDigits
              />
            </PositionStat>

            <PositionStat
              label={<Trans>{"Supplied Asset Value: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Supplied Asset Value represents the sum of the supplied
                    assets, expressed in the selected fiat currency.
                  </Text>
                </Trans>
              }
              differs={totalCollateralDiffers}
              original={
                <LocalizedFiatDisplay
                  valueUSD={originalTotalCollateralUSD}
                  hideFractionDigits
                />
              }
            >
              <LocalizedFiatDisplay
                valueUSD={totalCollateralUSD}
                hideFractionDigits
              />
            </PositionStat>

            <PositionStat
              label={<Trans>{"Net Asset Value: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Net Asset Value represents the sum of the supplied asset
                    value subtracted by the sum of the borrowed asset value,
                    expressed in the selected fiat currency.
                  </Text>
                </Trans>
              }
              differs={netValueUSDDiffers}
              original={
                <LocalizedFiatDisplay
                  valueUSD={originalNetValueUSD}
                  hideFractionDigits
                />
              }
            >
              <LocalizedFiatDisplay valueUSD={netValueUSD} hideFractionDigits />
            </PositionStat>
          </SimpleGrid>
        </Flex>
      </div>
    </div>
  );
};

export default HealthFactorSummary;
