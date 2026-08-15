import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import {
  Button,
  Divider,
  Progress,
  SimpleGrid,
  Text,
  Transition,
} from "@mantine/core";
import { BsChevronDown, BsChevronUp } from "react-icons/bs";
import { ImmutableObject } from "@hookstate/core";

import {
  HealthFactorData,
  getHealthFactorColor,
} from "../../hooks/useAaveData";
import { PositionStat } from "./PositionStat";

type ExtendedPositionDetailsProps = {
  data: ImmutableObject<HealthFactorData>;
};

export const ExtendedPositionDetails = ({
  data,
}: ExtendedPositionDetailsProps) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!data || data?.isFetching) return null;

  const addressHasPosition: boolean =
    (data.fetchedData?.healthFactor || -1) > -1;

  const origHasReserves: boolean =
    (data.fetchedData?.totalCollateralMarketReferenceCurrency || 0) > 0;
  const currHasReserves: boolean =
    (data.workingData?.totalCollateralMarketReferenceCurrency || 0) > 0;

  const origHasBorrows: boolean =
    (data.fetchedData?.totalBorrowsMarketReferenceCurrency || 0) > 0;
  const currHasBorrows: boolean =
    (data.workingData?.totalBorrowsMarketReferenceCurrency || 0) > 0;

  /** LIQUIDATION THRESHOLD */
  const originalLT = data.fetchedData?.currentLiquidationThreshold;
  const currentLT = data.workingData?.currentLiquidationThreshold;

  const originalLTDisplayable = origHasReserves
    ? `${((originalLT || 0) * 100).toFixed(1)}%`
    : "---";
  const currentLTDisplayable = currHasReserves
    ? `${((currentLT || 0) * 100).toFixed(1)}%`
    : "---";

  const ltDiffers: boolean =
    addressHasPosition && originalLTDisplayable !== currentLTDisplayable;

  /** MAX LTV */
  const originalMaxLTV = data.fetchedData?.currentLoanToValue;
  const currentMaxLTV = data.workingData?.currentLoanToValue;

  const originalMaxLTVDisplayable = origHasReserves
    ? `${((originalMaxLTV || 0) * 100).toFixed(1)}%`
    : "---";
  const currentMaxLTVDisplayable = currHasReserves
    ? `${((currentMaxLTV || 0) * 100).toFixed(1)}%`
    : "---";

  const maxLTVDiffers: boolean =
    addressHasPosition &&
    originalMaxLTVDisplayable !== currentMaxLTVDisplayable;

  /** BORROWING POWER */
  const availableBorrowsUSD: number = Math.max(
    data.workingData?.availableBorrowsUSD ?? 0,
    0,
  );

  const originalTotalBorrowsUSD: number =
    data.fetchedData?.totalBorrowsUSD ?? 0;

  const totalBorrowsUSD: number = data.workingData?.totalBorrowsUSD ?? 0;

  const originalAvailableBorrowsUSD: number = Math.max(
    data.fetchedData?.availableBorrowsUSD ?? 0,
    0,
  );

  const currentCumulativeAvailableBorrows =
    availableBorrowsUSD + totalBorrowsUSD;
  const currBorrowPowerUsed =
    (100 * totalBorrowsUSD) / (currentCumulativeAvailableBorrows || 1);

  const originalCumulativeAvailableBorrows =
    originalAvailableBorrowsUSD + originalTotalBorrowsUSD;

  const origBorrowPowerUsed =
    (100 * originalTotalBorrowsUSD) / (originalCumulativeAvailableBorrows || 1);

  const origBorrowPowerUsedDisplayable = origHasBorrows
    ? `${origBorrowPowerUsed?.toFixed(0)}%`
    : "---";
  const currBorrowPowerUsedDisplayable = currHasBorrows
    ? `${currBorrowPowerUsed?.toFixed(0)}%`
    : "---";

  const borrowPowerDiffers: boolean =
    addressHasPosition &&
    origBorrowPowerUsedDisplayable !== currBorrowPowerUsedDisplayable;

  /** CURRENT LTV */
  const originalWorkingLTV = Math.min(
    100,
    (100 * (data.fetchedData?.totalBorrowsMarketReferenceCurrency || 1)) /
      (data.fetchedData?.totalCollateralMarketReferenceCurrency || 1),
  );

  const currentWorkingLTV = Math.min(
    100,
    (100 * (data.workingData?.totalBorrowsMarketReferenceCurrency || 1)) /
      (data.workingData?.totalCollateralMarketReferenceCurrency || 1),
  );

  const originalWorkingLTVDisplayable = origHasBorrows
    ? `${originalWorkingLTV.toFixed(1)}%`
    : "---";
  const currentWorkingLTVDisplayable = currHasBorrows
    ? `${currentWorkingLTV?.toFixed(1)}%`
    : "---";

  const workingLTVDiffers: boolean =
    addressHasPosition &&
    originalWorkingLTVDisplayable !== currentWorkingLTVDisplayable;

  const hfColor: string = getHealthFactorColor(
    data.workingData?.healthFactor || 0,
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
            onClick={() => setShowDetails(!showDetails)}
            rightSection={showDetails ? <BsChevronUp /> : <BsChevronDown />}
            aria-expanded={showDetails}
          >
            <Trans>Advanced Position Details</Trans>
          </Button>
        }
      />
      <Transition
        mounted={showDetails}
        transition="slide-down"
        duration={400}
        exitDuration={0}
        timingFunction="ease"
      >
        {(styles) => (
          <SimpleGrid
            style={styles}
            cols={{ base: 2, lg: 4 }}
            spacing="lg"
            verticalSpacing="sm"
            mb="sm"
          >
            <PositionStat
              label={<Trans>{"Liquidation Threshold: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Liquidation Threshold refers to the loan to value percentage
                    that makes the position subject to liquidation. This value
                    applies to the overall position.
                  </Text>
                </Trans>
              }
              differs={ltDiffers}
              original={originalLTDisplayable}
            >
              {currentLTDisplayable}
            </PositionStat>

            <PositionStat
              label={<Trans>{"Max Loan to Value: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Maximum Loan to Value refers to the loan to value percentage
                    where new loans may not be initiated. This value applies to
                    the overall position.
                  </Text>
                </Trans>
              }
              differs={maxLTVDiffers}
              original={originalMaxLTVDisplayable}
            >
              {currentMaxLTVDisplayable}
            </PositionStat>

            <PositionStat
              label={<Trans>{"Current Loan to Value: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Current Loan to Value refers to the overall value of all
                    borrowed assets relative to the overall value of the
                    supplied assets. This value applies to the overall position.
                  </Text>
                </Trans>
              }
              differs={workingLTVDiffers}
              original={originalWorkingLTVDisplayable}
            >
              {currentWorkingLTVDisplayable}
            </PositionStat>

            <PositionStat
              label={<Trans>{"Utilized Borrowing Power: "}</Trans>}
              description={
                <Trans>
                  <Text size="sm">
                    Borrowing Power represents the value of borrowed assets
                    relative to the total value available to borrow. This value
                    applies to the overall position.
                  </Text>
                </Trans>
              }
              differs={borrowPowerDiffers}
              original={origBorrowPowerUsedDisplayable}
              meter={
                <Progress
                  color={hfColor}
                  mt="xs"
                  radius="md"
                  size="lg"
                  value={currBorrowPowerUsed}
                  striped
                />
              }
            >
              {currBorrowPowerUsedDisplayable}
            </PositionStat>
          </SimpleGrid>
        )}
      </Transition>
    </>
  );
};

export default ExtendedPositionDetails;
