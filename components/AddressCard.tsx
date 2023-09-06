import {
  ReactElement,
  RefObject,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatNumber, formatMoney, unformat } from "accounting";
import noUiSlider from "nouislider";
import { Trans, Plural, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";

import {
  Center,
  Group,
  Text,
  Title,
  Grid,
  TextInput,
  Paper,
  Divider,
  Container,
  ActionIcon,
  Mark,
  Button,
  Tooltip,
  Checkbox,
  Skeleton,
  Transition,
  Avatar,
  Badge,
  Flex,
  Space,
  Popover,
  Overlay,
  Alert,
  Progress,
} from "@mantine/core";
import { FaAsterisk, FaInfinity, FaInfo, FaInfoCircle } from "react-icons/fa";
import { RxReset } from "react-icons/rx";
import { IoLogoUsd } from "react-icons/io";
import { ImmutableArray, ImmutableObject } from "@hookstate/core";
import AddAssetDialog from "./AddAssetDialog";

import {
  useAaveData,
  HealthFactorData,
  ReserveAssetDataItem,
  BorrowedAssetDataItem,
  markets,
  getHealthFactorColor,
  getIconNameFromAssetSymbol,
  AssetDetails,
  getCalculatedLiquidationScenario,
} from "../hooks/useAaveData";
import { BsChevronDown, BsChevronUp } from "react-icons/bs";
import { AaveHealthFactorData } from "../hooks/useAaveData";
import { FiAlertTriangle } from "react-icons/fi";
import LocalizedFiatDisplay from "./LocalizedFiatDisplay";
import { useFiatRates } from "../hooks/useFiatData";

type Props = {};

const AddressCard = ({ }: Props) => {
  const { addressData, currentMarket, applyLiquidationScenario, isFetching } =
    useAaveData("");
  const data = addressData?.[currentMarket] as HealthFactorData;
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryOffset: number = summaryRef?.current?.clientHeight || 0;
  const isEmode: boolean = (data?.workingData?.userEmodeCategoryId || 0) !== 0;
  const isIsolationMode: boolean = !!data?.workingData?.isInIsolationMode;
  const isError: boolean = !!data?.fetchError?.length;
  const marketName =
    markets.find((market) => market.id === currentMarket)?.title ||
    "Unknown Market";

  return (
    <div style={{ marginTop: "15px" }}>
      <HealthFactorAddressSummary addressData={addressData} />
      <div style={{ zIndex: "6", backgroundColor: "#1A1B1E" }}>
        {isError && (
          <Trans>
            <Alert
              mb={15}
              mt={45}
              icon={<FiAlertTriangle size="1rem" />}
              title="Error Loading Market Data!"
              color="red"
              variant="outline"
            >
              {`An error occurred while loading data for this market (${marketName}). Try again later, or select a different market.`}
            </Alert>
          </Trans>
        )}
        {isIsolationMode && (
          <Trans>
            <Alert
              mb={15}
              mt={45}
              icon={<FiAlertTriangle size="1rem" />}
              title="Isolation Mode Not Supported!"
              color="red"
              variant="outline"
            >
              This debt position has Isolation Mode enabled, but DeFi Simulator
              does not yet support positions with Isolation mode enabled. We
              hope to add support for Isolation Mode soon.
            </Alert>
          </Trans>
        )}
        {isEmode && (
          <Trans>
            <Alert
              mb={15}
              mt={45}
              icon={<FiAlertTriangle size="1rem" />}
              title="Emode Not Supported!"
              color="red"
              variant="outline"
            >
              This debt position has Emode (Efficieny Mode) enabled, but DeFi
              Simulator does not yet support positions with Emode enabled. We
              hope to add support for Emode soon.
            </Alert>
          </Trans>
        )}
        {!isEmode && !isIsolationMode && !isError && (
          <>
            {isFetching ? (
              <HealthFactorSkeleton animate />
            ) : (
              <>
                <HealthFactorSummary summaryRef={summaryRef} data={data} />
                <ExtendedPositionDetails data={data} />
                <LiquidationScenario
                  data={data}
                  applyLiquidationScenario={applyLiquidationScenario}
                />
                <UserReserveAssetList summaryOffset={summaryOffset} />
                <Space h="xl" />
                <Space h="xl" />
                <UserBorrowedAssetList summaryOffset={summaryOffset} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AddressCard;

type HealthFactorAddressSummaryProps = {
  addressData: any;
};

export const HealthFactorAddressSummary = ({
  addressData,
}: HealthFactorAddressSummaryProps) => {
  const { isFetching, currentAddress } = useAaveData("");
  const count = markets.filter(
    (market) => addressData?.[market.id]?.fetchedData?.healthFactor > -1
  ).length;

  if (isFetching) {
    return (
      <Center>
        <Skeleton height={50} />
      </Center>
    );
  }

  return (
    <>
      <Center>
        {count ? (
          <Text size="sm" style={{ display: "inline-block" }}>
            <AbbreviatedEthereumAddress address={currentAddress} />
            {":  "}
            <Trans>Found</Trans> Aave{" "}
            <Plural value={Number(count)} one="position" other="positions" />{" "}
            <Trans>in</Trans> {count}{" "}
            <Plural value={Number(count)} one="market" other="markets" />
          </Text>
        ) : (
          <Text size="sm" style={{ display: "inline-block" }}>
            <AbbreviatedEthereumAddress address={currentAddress} />
            {": "}
            <Trans>No Aave positions found.</Trans>
          </Text>
        )}
      </Center>

      <Center>
        <Text size="sm" ta="center" mt="md">
          <Trans>
            Add, remove, and modify asset prices and quantities below to
            visualize changes to health factor and borrowing power.
          </Trans>
        </Text>
      </Center>
    </>
  );
};

type HealthFactorSkeletonProps = {
  animate?: boolean;
};

export const HealthFactorSkeleton = ({
  animate,
}: HealthFactorSkeletonProps) => {
  const items = [1, 2, 3, 4, 5];
  return (
    <>
      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label={
          <Title order={3}>
            <Skeleton height={35} width={175} animate={animate} />
          </Title>
        }
      />
      <Grid>
        <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
          <Paper>
            <Text fz="xs">
              <Trans>{"Total Borrowed: "}</Trans>
            </Text>
            <Skeleton height={45} mb="xl" animate={animate} />
          </Paper>
        </Grid.Col>
        <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
          <Text fz="xs">
            <Trans>{"Available to Borrow: "}</Trans>
          </Text>
          <Skeleton height={45} mb="xl" animate={animate} />
        </Grid.Col>
        <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
          <Paper>
            <Text fz="xs">
              <Trans>{"Supplied Asset Value: "}</Trans>
            </Text>
            <Skeleton height={45} mb="xl" animate={animate} />
          </Paper>
        </Grid.Col>
        <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
          <Text fz="xs">
            <Trans>{"Net Asset Value: "}</Trans>
          </Text>
          <Skeleton height={45} mb="xl" animate={animate} />
        </Grid.Col>
      </Grid>
      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label={
          <Title order={3}>
            <Skeleton height={25} width={145} animate={animate} />
          </Title>
        }
      />
      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label={
          <Title order={3}>
            <Skeleton height={25} width={145} animate={animate} />
          </Title>
        }
      />
      {items.map((item) => (
        <Paper shadow="xs" sx={{ marginBottom: "50px" }} key={item}>
          <Skeleton height={20} width={175} mb="xl" animate={animate} />

          <Grid columns={17}>
            <Grid.Col span={8}>
              <Skeleton height={55} mb="xl" animate={animate} />
            </Grid.Col>
            <Grid.Col span={1}>
              <Center sx={{ height: "100%" }}>
                <Skeleton height={10} mb="xl" animate={animate} />
              </Center>
            </Grid.Col>
            <Grid.Col span={8}>
              <Skeleton height={55} mb="xl" animate={animate} />
            </Grid.Col>
          </Grid>
          <Skeleton height={10} width={175} mb="xl" animate={animate} />
        </Paper>
      ))}
    </>
  );
};

type HealthFactorSummaryProps = {
  data: ImmutableObject<HealthFactorData>;
  summaryRef: RefObject<HTMLDivElement>;
};

const HealthFactorSummary = ({
  data,
  summaryRef,
}: HealthFactorSummaryProps) => {
  if (data?.isFetching) return <HealthFactorSkeleton animate />;

  if (!data) {
    return (
      <Center mt={30}>
        <Text>
          <Trans>
            Something happened, we're not able to load the address debt position
            data right now. Try again later.
          </Trans>
        </Text>
      </Center>
    );
  }

  const addressHasPosition: boolean =
    (data.fetchedData?.healthFactor || -1) > -1;

  const originalHealthFactorDisplayable: string = formatNumber(
    Math.max(data.fetchedData?.healthFactor || 0, 0),
    2
  );

  const hfColor: string = getHealthFactorColor(
    data.workingData?.healthFactor || 0
  );

  const healthFactorElem: ReactElement =
    data.workingData?.healthFactor === Infinity ? (
      <Center inline>
        <FaInfinity size={24} style={{ paddingTop: "8px" }} />
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
    0
  );

  const availableBorrowsUSD: number = Math.max(
    data.workingData?.availableBorrowsUSD ?? 0,
    0
  );

  const availableBorrowsDiffers: boolean =
    addressHasPosition &&
    data.fetchedData?.availableBorrowsUSD?.toFixed(2) !==
    data.workingData?.availableBorrowsUSD?.toFixed(2);

  const originalTotalCollateralUSD: number =
    data.fetchedData?.userReservesData.reduce(
      (acc, item) => (acc += item.underlyingBalanceUSD),
      0
    ) ?? 0;
  const totalCollateralUSD: number =
    data.workingData?.userReservesData.reduce(
      (acc, item) => (acc += item.underlyingBalanceUSD),
      0
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
      2
    );

  return (
    <div ref={summaryRef} style={{ position: "sticky", top: "0", zIndex: "5" }}>
      <Paper pb={5}>
        <Divider
          my="sm"
          variant="dashed"
          labelPosition="center"
          label={
            <Title order={3}>
              <Popover width="300px" withArrow shadow="md">
                <Popover.Target>
                  <Text
                    span
                    underline
                    style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                  >
                    <Trans>{"Health Factor"}</Trans>
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
              {": "}
              {healthFactorDiffers && (
                <>
                  <Text mr="4px" span c="dimmed">
                    {`${originalHealthFactorDisplayable}`}
                  </Text>
                  <Text span c="dimmed">
                    ➔
                  </Text>
                </>
              )}
              <Mark ml="4px" mr="2px" color={hfColor}>
                <Text span pl="2px" pr="2px">
                  {healthFactorElem}
                </Text>
              </Mark>
              <ResetMarketButton />
            </Title>
          }
        />
        <Grid>
          <Grid.Col
            lg={3}
            xs={6}
            style={{ textAlign: "center", minHeight: "78px" }}
          >
            <Paper>
              <Popover width="250px" withArrow shadow="md">
                <Popover.Target>
                  <Text
                    fz="xs"
                    underline
                    style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                  >
                    <Trans>{"Total Borrowed: "}</Trans>
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Trans>
                    <Text size="sm">
                      Total Borrowed refers to the sum of all assets borrowed,
                      expressed in the selected fiat currency.
                    </Text>
                  </Trans>
                </Popover.Dropdown>
              </Popover>

              {totalBorrowsDiffers && (
                <Text fz="xs" c="dimmed">
                  <LocalizedFiatDisplay valueUSD={originalTotalBorrowsUSD} /> ➔
                </Text>
              )}
              <Text span fw={700} fz="md" mb={20}>
                <LocalizedFiatDisplay valueUSD={totalBorrowsUSD} />
              </Text>
            </Paper>
          </Grid.Col>
          <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
            <Popover width="250px" withArrow shadow="md">
              <Popover.Target>
                <Text
                  fz="xs"
                  underline
                  style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                >
                  <Trans>{"Available to Borrow: "}</Trans>
                </Text>
              </Popover.Target>
              <Popover.Dropdown>
                <Trans>
                  <Text size="sm">
                    Available to Borrow represents the total borrowing power
                    available to the position, expressed in the selected fiat
                    currency.
                  </Text>
                </Trans>
              </Popover.Dropdown>
            </Popover>
            {availableBorrowsDiffers && (
              <Text fz="xs" c="dimmed">
                <LocalizedFiatDisplay valueUSD={originalAvailableBorrowsUSD} />{" "}
                ➔
              </Text>
            )}
            <Text span fw={700} fz="md">
              <LocalizedFiatDisplay valueUSD={availableBorrowsUSD} />
            </Text>
          </Grid.Col>
          <Grid.Col
            lg={3}
            xs={6}
            style={{ textAlign: "center", minHeight: "78px" }}
          >
            <Paper>
              <Popover width="250px" withArrow shadow="md">
                <Popover.Target>
                  <Text
                    fz="xs"
                    underline
                    style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                  >
                    <Trans>{"Supplied Asset Value: "}</Trans>
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Trans>
                    <Text size="sm">
                      Supplied Asset Value represents the sum of the supplied
                      assets, expressed in the selected fiat currency.
                    </Text>
                  </Trans>
                </Popover.Dropdown>
              </Popover>
              {totalCollateralDiffers && (
                <Text fz="xs" c="dimmed">
                  <LocalizedFiatDisplay valueUSD={originalTotalCollateralUSD} />{" "}
                  ➔
                </Text>
              )}
              <Text span fw={700} fz="md">
                <LocalizedFiatDisplay valueUSD={totalCollateralUSD} />
              </Text>
            </Paper>
          </Grid.Col>
          <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
            <Popover width="250px" withArrow shadow="md">
              <Popover.Target>
                <Text
                  fz="xs"
                  underline
                  style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                >
                  <Trans>{"Net Asset Value: "}</Trans>
                </Text>
              </Popover.Target>
              <Popover.Dropdown>
                <Trans>
                  <Text size="sm">
                    Net Asset Value represents the sum of the supplied asset value
                    subtracted by the sum of the borrowed asset value, expressed in
                    the selected fiat currency.
                  </Text>
                </Trans>
              </Popover.Dropdown>
            </Popover>
            {netValueUSDDiffers && (
              <Text fz="xs" c="dimmed">
                <LocalizedFiatDisplay valueUSD={originalNetValueUSD} /> ➔
              </Text>
            )}
            <Text span fw={700} fz="md">
              <LocalizedFiatDisplay valueUSD={netValueUSD} />
            </Text>
          </Grid.Col>
        </Grid>
      </Paper>
    </div>
  );
};

type ExtendedPositionDetailsProps = {
  data: ImmutableObject<HealthFactorData>;
};

const ExtendedPositionDetails = ({ data }: ExtendedPositionDetailsProps) => {
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
    0
  );

  const originalTotalBorrowsUSD: number =
    data.fetchedData?.totalBorrowsUSD ?? 0;

  const totalBorrowsUSD: number = data.workingData?.totalBorrowsUSD ?? 0;

  const originalAvailableBorrowsUSD: number = Math.max(
    data.fetchedData?.availableBorrowsUSD ?? 0,
    0
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
    (data.fetchedData?.totalCollateralMarketReferenceCurrency || 1)
  );

  const currentWorkingLTV = Math.min(
    100,
    (100 * (data.workingData?.totalBorrowsMarketReferenceCurrency || 1)) /
    (data.workingData?.totalCollateralMarketReferenceCurrency || 1)
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
    data.workingData?.healthFactor || 0
  );

  return (
    <>
      <Divider
        variant="dashed"
        my="sm"
        labelPosition="center"
        label={
          <>
            <Button
              variant="subtle"
              color="gray"
              compact
              onClick={() => setShowDetails(!showDetails)}
              rightIcon={showDetails ? <BsChevronUp /> : <BsChevronDown />}
            >
              <Trans>Advanced Position Details</Trans>
            </Button>
          </>
        }
        style={{ backgroundColor: "#1A1B1E" }}
      />
      <Transition
        mounted={showDetails}
        transition="slide-down"
        duration={1600}
        exitDuration={0}
        timingFunction="ease"
      >
        {(styles) => {
          return (
            <Grid>
              <Grid.Col
                lg={3}
                xs={6}
                style={{ textAlign: "center", minHeight: "78px" }}
              >
                <Paper>
                  <Popover width="250px" withArrow shadow="md">
                    <Popover.Target>
                      <Text
                        fz="xs"
                        underline
                        style={{
                          textDecorationStyle: "dotted",
                          cursor: "pointer",
                        }}
                      >
                        <Trans>{"Liquidation Threshold: "}</Trans>
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Trans>
                        <Text size="sm">
                          Liquidation Threshold refers to the loan to value
                          percentage that makes the position subject to
                          liquidation. This value applies to the overall
                          position.
                        </Text>
                      </Trans>
                    </Popover.Dropdown>
                  </Popover>

                  {ltDiffers && (
                    <Text fz="xs" c="dimmed">
                      {originalLTDisplayable} ➔
                    </Text>
                  )}
                  <Text span fw={700} fz="md" mb={20}>
                    {currentLTDisplayable}
                  </Text>
                </Paper>
              </Grid.Col>

              <Grid.Col lg={3} xs={6} style={{ textAlign: "center" }}>
                <Popover width="250px" withArrow shadow="md">
                  <Popover.Target>
                    <Text
                      fz="xs"
                      underline
                      style={{
                        textDecorationStyle: "dotted",
                        cursor: "pointer",
                      }}
                    >
                      <Trans>{"Max Loan to Value: "}</Trans>
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Trans>
                      <Text size="sm">
                        Maximum Loan to Value refers to the loan to value percentage
                        where new loans may not be initiated. This value applies
                        to the overall position.
                      </Text>
                    </Trans>
                  </Popover.Dropdown>
                </Popover>
                {maxLTVDiffers && (
                  <Text fz="xs" c="dimmed">
                    {originalMaxLTVDisplayable} ➔
                  </Text>
                )}
                <Text span fw={700} fz="md">
                  {currentMaxLTVDisplayable}{" "}
                </Text>
              </Grid.Col>

              <Grid.Col
                lg={3}
                xs={6}
                style={{ textAlign: "center", minHeight: "78px" }}
              >
                <Paper>
                  <Popover width="250px" withArrow shadow="md">
                    <Popover.Target>
                      <Text
                        fz="xs"
                        underline
                        style={{
                          textDecorationStyle: "dotted",
                          cursor: "pointer",
                        }}
                      >
                        <Trans>{"Current Loan to Value: "}</Trans>
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Trans>
                        <Text size="sm">
                          Current Loan to Value refers to the overall value of
                          all borrowed assets relative to the overall value of
                          the supplied assets. This value applies to the overall
                          position.
                        </Text>
                      </Trans>
                    </Popover.Dropdown>
                  </Popover>

                  {workingLTVDiffers && (
                    <Text fz="xs" c="dimmed">
                      {originalWorkingLTVDisplayable} ➔
                    </Text>
                  )}
                  <Text span fw={700} fz="md" mb={20}>
                    {currentWorkingLTVDisplayable}
                  </Text>
                </Paper>
              </Grid.Col>

              <Grid.Col
                lg={3}
                xs={6}
                px="xl"
                style={{ textAlign: "center", minHeight: "78px" }}
              >
                <Paper>
                  <Popover width="250px" withArrow shadow="md">
                    <Popover.Target>
                      <Text
                        fz="xs"
                        underline
                        style={{
                          textDecorationStyle: "dotted",
                          cursor: "pointer",
                        }}
                      >
                        <Trans>{"Utilized Borrowing Power: "}</Trans>
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Trans>
                        <Text size="sm">
                          Borrowing Power represents the value of borrowed
                          assets relative to the total value available to
                          borrow. This value applies to the overall position.
                        </Text>
                      </Trans>
                    </Popover.Dropdown>
                  </Popover>

                  <Progress
                    color={hfColor}
                    mt="xs"
                    radius="md"
                    size="lg"
                    value={currBorrowPowerUsed}
                    striped
                  />
                  {borrowPowerDiffers && (
                    <Text span fz="xs" c="dimmed">
                      {origBorrowPowerUsedDisplayable}
                      {" ➔ "}
                    </Text>
                  )}
                  <Text span fw={700} fz="md">
                    {currBorrowPowerUsedDisplayable}
                  </Text>
                </Paper>
              </Grid.Col>
            </Grid>
          );
        }}
      </Transition>
    </>
  );
};

type LiquidationScenarioProps = {
  data: ImmutableObject<HealthFactorData>;
  applyLiquidationScenario: () => void;
};

const LiquidationScenario = ({
  data,
  applyLiquidationScenario,
}: LiquidationScenarioProps) => {
  const [showLiquidation, setShowLiquidation] = useState(false);

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
          <>
            <Button
              variant="subtle"
              color="gray"
              compact
              onClick={() => setShowLiquidation(!showLiquidation)}
              rightIcon={showLiquidation ? <BsChevronUp /> : <BsChevronDown />}
            >
              <Trans>Price Liquidation Scenario</Trans>
            </Button>
          </>
        }
        style={{ backgroundColor: "#1A1B1E" }}
      />
      <Transition
        mounted={showLiquidation}
        transition="slide-down"
        duration={1600}
        exitDuration={0}
        timingFunction="ease"
      >
        {(styles) => {
          return (
            <Flex
              gap="sm"
              justify="center"
              align="center"
              direction="row"
              wrap="wrap"
            >
              <Popover width="250px" position="bottom" withArrow shadow="md">
                <Popover.Target>
                  <ActionIcon style={{ display: "inline-block" }}>
                    <FiAlertTriangle size={18} />
                  </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                  <Trans>
                    <Text size="sm">
                      The price liquidation scenario represents
                      supplied asset prices slightly greater than the prices that could subject the
                      position to liquidation. Stable assets are not included in
                      this scenario and are assumed to maintain their present
                      value. Many factors affect liquidation. This scenario is
                      only one example for reference. Many different scenarios
                      can trigger liquidation.
                      <a
                        href="https://docs.aave.com/faq/liquidations"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#e9ecef" }}
                      >
                        {" Read more here"}
                      </a>
                      {"."}
                    </Text>
                  </Trans>
                </Popover.Dropdown>
              </Popover>
              {scenario.map((liqAsset) => {
                const workingAsset = data.workingData?.userReservesData.find(
                  (reserve) => reserve.asset.symbol === liqAsset.symbol
                )?.asset;
                const currentAssetPrice = workingAsset
                  ? workingAsset.priceInUSD
                  : liqAsset.initialPriceInUSD;

                const diff = currentAssetPrice - liqAsset.priceInUSD;

                const change =
                  Math.round((diff * 100) / currentAssetPrice) * -1;
                const avatarName = getIconNameFromAssetSymbol(liqAsset.symbol);

                const avatar = (
                  <Avatar
                    alt={`Logo for ${liqAsset.symbol}`}
                    size={24}
                    mr={2}
                    src={`/icons/tokens/${avatarName}.svg`}
                  />
                );

                return (
                  <Badge
                    key={liqAsset.symbol}
                    pl={0}
                    size="lg"
                    radius="lg"
                    mr="sm"
                    c="dimmed"
                    leftSection={avatar}
                  >
                    <LocalizedFiatDisplay valueUSD={liqAsset.priceInUSD} />
                    {/** 
                      {change !== 0 && currentAssetPrice !== 0 &&
                        <Text span size="xs" c="dimmed">
                          <Text span size="xs" color={change < 0 ? "red" : "dimmed"}>
                            {` (${change > 0 ? "+" : ""}${change}%)`}
                          </Text>
                        </Text>
                      }
                      */}
                  </Badge>
                );
              })}
              <Button
                variant="subtle"
                color="gray"
                compact
                onClick={applyLiquidationScenario}
              >
                <Trans>Apply</Trans>
              </Button>
            </Flex>
          );
        }}
      </Transition>
      {showLiquidation && <Divider my="sm" variant="dashed" />}
    </>
  );
};

const ResetMarketButton = ({ }) => {
  const { addressData, currentMarket, resetCurrentMarketChanges } =
    useAaveData("");
  const data = addressData?.[currentMarket];

  let isAnyModified: boolean = false;

  if (
    data.workingData?.userReservesData.length !==
    data.fetchedData?.userReservesData.length
  ) {
    isAnyModified = true;
  }

  if (
    data.workingData?.userBorrowsData.length !==
    data.fetchedData?.userBorrowsData.length
  ) {
    isAnyModified = true;
  }

  if (data.workingData?.healthFactor !== data.fetchedData?.healthFactor) {
    isAnyModified = true;
  }

  if (!isAnyModified) return null;

  const label = <Trans>Reset all simulated values</Trans>;

  return (
    <Tooltip label={label} position="top-end" withArrow>
      <ActionIcon style={{ display: "inline-block" }}>
        <RxReset
          size={18}
          onClick={resetCurrentMarketChanges}
          color="#339af0"
        />
      </ActionIcon>
    </Tooltip>
  );
};

type UserReserveAssetListProps = {
  summaryOffset: number;
};

const UserReserveAssetList = ({ summaryOffset }: UserReserveAssetListProps) => {
  const {
    addressData,
    currentMarket,
    currentAddress,
    addReserveAsset,
    removeAsset,
    setAssetPriceInUSD,
    setReserveAssetQuantity,
    setUseReserveAssetAsCollateral,
  } = useAaveData("");
  const { i18n } = useLingui();
  const items: ImmutableArray<ReserveAssetDataItem> =
    addressData?.[currentMarket]?.workingData?.userReservesData || [];

  const market = markets.find((market) => market.id === currentMarket);

  return (
    <div style={{ marginTop: "15px" }}>
      <Container
        style={{
          marginTop: "15px",
          display: "flex",
          justifyContent: "space-between",
          padding: "0px",
          paddingBottom: "5px",
          position: "sticky",
          top: `${summaryOffset}px`,
          zIndex: "4",
          backgroundColor: "#1A1B1E",
        }}
      >
        <Title order={4} sx={{ marginBottom: "10px" }}>
          <Trans>Supplied Assets</Trans>
        </Title>
        <AddAssetDialog assetType="RESERVE" />
      </Container>
      {items.length === 0 && (
        <Center>
          <Text fz="sm" m={25} align="center">
            <Trans>
              {"There are no supplied assets for "}
              <AbbreviatedEthereumAddress address={currentAddress} />
              {` in the ${market?.title} market. Select "Add Supplied Asset" to simulate supplied assets for this address.`}
            </Trans>
          </Text>
        </Center>
      )}
      {items.map((item) => {
        const originalAsset = addressData?.[
          currentMarket
        ]?.fetchedData?.userReservesData?.find(
          (asset) => asset.asset.symbol === item.asset.symbol
        );
        return (
          <UserAssetItem
            key={`${item.asset.symbol}-RESERVE`}
            assetSymbol={item.asset.symbol}
            usageAsCollateralEnabledOnUser={item.usageAsCollateralEnabledOnUser}
            assetType="RESERVE"
            workingQuantity={item.underlyingBalance}
            originalQuantity={originalAsset?.underlyingBalance ?? 0}
            workingPrice={item.asset.priceInUSD}
            originalPrice={originalAsset?.asset.priceInUSD ?? 0}
            onAddAsset={addReserveAsset}
            onRemoveAsset={removeAsset}
            setAssetPriceInUSD={setAssetPriceInUSD}
            setAssetQuantity={setReserveAssetQuantity}
            setUseReserveAssetAsCollateral={setUseReserveAssetAsCollateral}
            disableSetUseReserveAssetAsCollateral={
              !item.asset.usageAsCollateralEnabled
            }
            isNewlyAddedBySimUser={!!item.asset.isNewlyAddedBySimUser}
            locale={i18n?.locale || ""}
          />
        );
      })}
    </div>
  );
};

type UserBorrowedAssetListProps = {
  summaryOffset: number;
};

const UserBorrowedAssetList = ({
  summaryOffset,
}: UserBorrowedAssetListProps) => {
  const {
    addressData,
    currentMarket,
    currentAddress,
    addBorrowAsset,
    removeAsset,
    setAssetPriceInUSD,
    setBorrowedAssetQuantity,
  } = useAaveData("");
  const { i18n } = useLingui();
  const items: ImmutableArray<BorrowedAssetDataItem> =
    addressData?.[currentMarket]?.workingData?.userBorrowsData || [];

  const market = markets.find((market) => market.id === currentMarket);

  return (
    <div style={{ marginTop: "15px" }}>
      <Container
        style={{
          marginTop: "15px",
          display: "flex",
          justifyContent: "space-between",
          padding: "0px",
          paddingBottom: "5px",
          position: "sticky",
          top: `${summaryOffset}px`,
          zIndex: "3",
          backgroundColor: "#1A1B1E",
        }}
      >
        <Title order={4} sx={{ marginBottom: "10px" }}>
          <Trans>Borrowed Assets</Trans>
        </Title>
        <AddAssetDialog assetType="BORROW" />
      </Container>
      {items.length === 0 && (
        <Center>
          <Text fz="sm" m={25} align="center">
            <Trans>
              {"There are no borrowed assets for "}
              <AbbreviatedEthereumAddress address={currentAddress} />
              {` in the ${market?.title} market. Select "Add Borrow Asset" to simulate borrowed assets for this address.`}
            </Trans>
          </Text>
        </Center>
      )}
      {items.map((item) => {
        const originalAsset = addressData?.[
          currentMarket
        ]?.fetchedData?.userBorrowsData?.find(
          (asset) => asset.asset.symbol === item.asset.symbol
        );
        return (
          <UserAssetItem
            key={`${item.asset.symbol}-BORROW`}
            assetSymbol={item.asset.symbol}
            isNewlyAddedBySimUser={!!item.asset.isNewlyAddedBySimUser}
            assetType="BORROW"
            usageAsCollateralEnabledOnUser={false}
            workingQuantity={item.totalBorrows}
            originalQuantity={originalAsset?.totalBorrows ?? 0}
            workingPrice={item.asset.priceInUSD}
            originalPrice={originalAsset?.asset.priceInUSD ?? 0}
            onAddAsset={addBorrowAsset}
            onRemoveAsset={removeAsset}
            setAssetPriceInUSD={setAssetPriceInUSD}
            setAssetQuantity={setBorrowedAssetQuantity}
            disableSetUseReserveAssetAsCollateral={false}
            locale={i18n?.locale || ""}
          />
        );
      })}
    </div>
  );
};

const UserAssetItemPropsChecker = (
  oldProps: UserAssetItemProps,
  newProps: UserAssetItemProps
) => {
  const oldQuantity = oldProps.workingQuantity;
  const oldPriceInUSD = oldProps.workingPrice;
  const oldCollateralEnabled = oldProps.usageAsCollateralEnabledOnUser;

  const newQuantity = newProps.workingQuantity;
  const newPriceInUSD = newProps.workingPrice;
  const newCollateralEnabled = newProps.usageAsCollateralEnabledOnUser;

  const arePropsEqual =
    oldQuantity === newQuantity &&
    oldPriceInUSD === newPriceInUSD &&
    oldCollateralEnabled === newCollateralEnabled &&
    oldProps.assetType === newProps.assetType &&
    oldProps.assetSymbol === newProps.assetSymbol &&
    oldProps.locale === newProps.locale;

  return arePropsEqual;
};

type UserAssetItemProps = {
  assetSymbol: string;
  usageAsCollateralEnabledOnUser: boolean;
  assetType: "RESERVE" | "BORROW";
  workingQuantity: number;
  originalQuantity: number;
  workingPrice: number;
  originalPrice: number;
  onAddAsset: (symbol: string) => void;
  onRemoveAsset: (symbol: string, assetType: string) => void;
  setAssetPriceInUSD: (symbol: string, price: number) => void;
  setAssetQuantity: (symbol: string, quantity: number) => void;
  setUseReserveAssetAsCollateral?: (symbol: string, value: boolean) => void;
  disableSetUseReserveAssetAsCollateral: boolean;
  isNewlyAddedBySimUser: boolean;
  locale: string;
};

const UserAssetItem = memo(
  ({
    assetSymbol,
    usageAsCollateralEnabledOnUser,
    assetType,
    workingQuantity,
    originalQuantity,
    workingPrice,
    originalPrice,
    onRemoveAsset,
    setAssetPriceInUSD,
    setAssetQuantity,
    setUseReserveAssetAsCollateral,
    disableSetUseReserveAssetAsCollateral,
    isNewlyAddedBySimUser,
  }: UserAssetItemProps) => {
    const iconName = getIconNameFromAssetSymbol(assetSymbol);
    return (
      <Paper mt="xl" mb="xl" withBorder p="xs" bg="#282a2e">
        <Group mb="sm">
          <img
            src={`/icons/tokens/${iconName}.svg`}
            width="24px"
            height="24px"
            alt={`${assetSymbol}`}
          />
          <Text fz="md" fw={700}>
            {assetSymbol}
          </Text>
        </Group>

        <Grid columns={17}>
          <Grid.Col span={8}>
            <UserAssetQuantityInput
              assetSymbol={assetSymbol}
              workingQuantity={workingQuantity}
              originalQuantity={originalQuantity}
              isNewlyAddedBySimUser={isNewlyAddedBySimUser}
              setAssetQuantity={setAssetQuantity}
            />
          </Grid.Col>
          <Grid.Col span={1}>
            <Center sx={{ height: "100%" }}>
              <FaAsterisk />
            </Center>
          </Grid.Col>
          <Grid.Col span={8}>
            <UserAssetPriceInput
              assetSymbol={assetSymbol}
              workingPrice={workingPrice}
              originalPrice={originalPrice}
              setAssetPriceInUSD={setAssetPriceInUSD}
            />
          </Grid.Col>
        </Grid>
        <Container
          mt="xs"
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "16px",
            padding: "0px",
          }}
        >
          <UserAssetItemQuantityPriceSummary
            workingQuantity={workingQuantity}
            workingPrice={workingPrice}
            originalQuantity={originalQuantity}
            originalPrice={originalPrice}
          />
        </Container>
        <Container
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0px",
            paddingTop: "6px",
          }}
        >
          {assetType === "RESERVE" ? (
            <UserAssetUseAsCollateralToggle
              assetSymbol={assetSymbol}
              usageAsCollateralEnabledOnUser={usageAsCollateralEnabledOnUser}
              setUseReserveAssetAsCollateral={setUseReserveAssetAsCollateral}
              disableSetUseReserveAssetAsCollateral={
                disableSetUseReserveAssetAsCollateral
              }
            />
          ) : (
            <Space m="lg" />
          )}
          <Button
            compact
            variant="light"
            onClick={() => onRemoveAsset(assetSymbol, assetType)}
          >
            {t`Remove ${assetSymbol}`}
          </Button>
        </Container>
      </Paper>
    );
  },
  UserAssetItemPropsChecker
);

type UserAssetItemQuantityPriceSummaryProps = {
  workingQuantity: number;
  workingPrice: number;
  originalQuantity?: number;
  originalPrice: number;
};

const UserAssetItemQuantityPriceSummary = ({
  workingQuantity,
  workingPrice,
  originalQuantity,
  originalPrice,
}: UserAssetItemQuantityPriceSummaryProps) => {
  const workingValue = workingQuantity * workingPrice;
  const originalValue = (originalQuantity || 0) * originalPrice;
  const valuedDiffers: boolean =
    originalValue > 0 && workingValue?.toFixed(2) !== originalValue?.toFixed(2);

  return (
    <div>
      {valuedDiffers && (
        <Text fz="xs" c="dimmed" style={{ display: "block" }}>
          = <LocalizedFiatDisplay valueUSD={originalValue} /> ➔
        </Text>
      )}
      <Text mt={valuedDiffers ? 0 : 19} style={{ display: "block" }}>
        <LocalizedFiatDisplay valueUSD={workingValue} includeCurrencyCode />
      </Text>
    </div>
  );
};

type UserAssetUseAsCollateralToggleProps = {
  assetSymbol: string;
  usageAsCollateralEnabledOnUser: boolean;
  setUseReserveAssetAsCollateral?: (symbol: string, value: boolean) => void;
  disableSetUseReserveAssetAsCollateral: boolean;
};

const UserAssetUseAsCollateralToggle = ({
  assetSymbol,
  usageAsCollateralEnabledOnUser,
  setUseReserveAssetAsCollateral,
  disableSetUseReserveAssetAsCollateral,
}: UserAssetUseAsCollateralToggleProps) => {
  const handleSetUseReserveAssetAsCollateral = () => {
    setUseReserveAssetAsCollateral !== undefined
      ? setUseReserveAssetAsCollateral(
        assetSymbol,
        !usageAsCollateralEnabledOnUser
      )
      : null;
  };

  const label = <Trans>{`Use ${assetSymbol} as collateral`}</Trans>;

  return (
    <Checkbox
      disabled={disableSetUseReserveAssetAsCollateral}
      size="sm"
      checked={usageAsCollateralEnabledOnUser}
      label={label}
      onChange={handleSetUseReserveAssetAsCollateral}
      mt={5}
      mb={12}
    />
  );
};

type UserAssetQuantityInputProps = {
  assetSymbol: string;
  workingQuantity: number;
  originalQuantity: number;
  isNewlyAddedBySimUser: boolean;
  setAssetQuantity: (symbol: string, quantity: number) => void;
};
const UserAssetQuantityInput = ({
  assetSymbol,
  workingQuantity,
  originalQuantity,
  isNewlyAddedBySimUser,
  setAssetQuantity,
}: UserAssetQuantityInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastInputValue, setLastInputValue] = useState(workingQuantity); // used to set slider to intuitive range

  useEffect(() => {
    // if it's a new asset, scroll into view and focus
    if (isNewlyAddedBySimUser) {
      inputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
      setTimeout(() => inputRef.current?.focus(), 250); // setTimeout req'd due to react race condition here
    }
  }, [!!inputRef.current]);

  const handleChange = (value: number, isSlider: boolean = false) => {
    if (value && value < 0) return;
    if (value === workingQuantity) return;
    if (!isSlider) setLastInputValue(value);
    setAssetQuantity(assetSymbol, value);
  };

  const resetIcon = (
    <ResetInputValueIcon
      originalValue={originalQuantity}
      workingValue={workingQuantity}
      onClick={() => handleChange(originalQuantity)}
    />
  );

  return (
    <>
      <TextInput
        ref={inputRef}
        value={ensureTinyNumberFormatting(workingQuantity) || ""}
        label={t`${assetSymbol} Quantity`}
        labelProps={{ size: "sm" }}
        onChange={(e) => handleChange(Number(e.target.value))}
        size="md"
        type="number"
        inputWrapperOrder={["label", "error", "input", "description"]}
        rightSection={resetIcon}
      />

      <Slider
        defaultValue={workingQuantity}
        onChange={(value) => handleChange(value, true)}
      />
    </>
  );
};

type ResetInputValueIconProps = {
  originalValue: number;
  workingValue: number;
  onClick: React.MouseEventHandler<SVGElement>;
};

const ResetInputValueIcon = ({
  originalValue,
  workingValue,
  onClick,
}: ResetInputValueIconProps) => {
  if (!originalValue || originalValue === workingValue) return null;

  const label = (
    <Trans>{`Reset to Original Value (${ensureTinyNumberFormatting(
      originalValue
    )})`}</Trans>
  );
  return (
    <Tooltip label={label} position="top-end" withArrow>
      <ActionIcon>
        <RxReset
          size={18}
          style={{ display: "block" }}
          onClick={onClick}
          color="#339af0"
        />
      </ActionIcon>
    </Tooltip>
  );
};

type UserAssetPriceInputProps = {
  assetSymbol: string;
  workingPrice: number;
  originalPrice: number;
  setAssetPriceInUSD: (symbol: string, price: number) => void;
};
const UserAssetPriceInput = ({
  assetSymbol,
  workingPrice,
  originalPrice,
  setAssetPriceInUSD,
}: UserAssetPriceInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { selectedCurrency, currentRate } = useFiatRates(false);
  const { i18n } = useLingui();

  const workingConvertedPrice = workingPrice * currentRate;
  const originalConvertedPrice = originalPrice * currentRate;

  const formatPrice = (value: number) => {
    return i18n.number(value, {
      style: "currency",
      currency: selectedCurrency,
    });
  };

  const formattedWorkingPrice: string = formatPrice(workingConvertedPrice);

  useEffect(() => {
    if (!formattedWorkingPrice) return;
    // the input is uncontrolled, but we need to support external "reset" functionality
    // and selected fiat currency changes
    if (
      inputRef.current &&
      inputRef.current.value !== formattedWorkingPrice &&
      inputRef.current !== document.activeElement // if input is focused, don't apply formatting
    ) {
      inputRef.current.value = formattedWorkingPrice;
    }
  }, [formattedWorkingPrice]);

  if (!selectedCurrency || !currentRate) return null;

  const convertValueToUSDAndSet = (assetSymbol: string, value: number) => {
    const updatedValue = value / currentRate;
    setAssetPriceInUSD(assetSymbol, updatedValue);
  };

  const handleReset = () => {
    const inputNode = inputRef.current as any;
    inputNode.value = formatPrice(originalConvertedPrice);
    handleChange(originalConvertedPrice);
  };

  const handleChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingConvertedPrice) return;
    //setLastInputValue(value);
    convertValueToUSDAndSet(assetSymbol, value);
  };

  const handleSliderChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingConvertedPrice) return;
    convertValueToUSDAndSet(assetSymbol, value);
    const inputNode = inputRef.current as any;
    inputNode.value = formatPrice(value);
  };

  const handleBlur = () => {
    const inputNode = inputRef.current as any;
    inputNode.value = formatPrice(workingConvertedPrice);
  };

  const resetIcon = (
    <ResetInputValueIcon
      originalValue={originalConvertedPrice}
      workingValue={workingConvertedPrice}
      onClick={handleReset}
    />
  );

  return (
    <>
      <TextInput
        defaultValue={formattedWorkingPrice}
        label={t`${assetSymbol} Price (${selectedCurrency})`}
        labelProps={{ size: "sm" }}
        onChange={(e) => handleChange(unformat(e.target.value))}
        onBlur={handleBlur}
        size="md"
        ref={inputRef}
        inputWrapperOrder={["label", "error", "input", "description"]}
        rightSection={resetIcon}
      />
      <Slider
        defaultValue={workingConvertedPrice}
        onChange={handleSliderChange}
      />
    </>
  );
};

type SliderProps = {
  defaultValue: number;
  onChange: (value: number) => void;
};

const Slider = ({ defaultValue, onChange }: SliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // initialize the slider
    if (divRef.current?.noUiSlider) return; // already initialized
    createSlider();
  }, []);

  useEffect(() => {
    // handle external reset or change
    if (
      !isDragging &&
      value != null &&
      defaultValue != null &&
      defaultValue !== value
    ) {
      createSlider();
    }
  }, [defaultValue, value, isDragging]);

  const createSlider = () => {
    const node = divRef.current;
    if (node.noUiSlider) {
      node.noUiSlider.destroy();
      node.noUiSlider = null;
    }

    noUiSlider
      .create(node, {
        start: [defaultValue],
        range: {
          min: [0],
          "15%": [Math.max(defaultValue * 0.5, 0.5)],
          "50%": [Math.max(defaultValue, 1)],
          "85%": [Math.max(defaultValue * 2, 2)],
          max: [Math.max(defaultValue * 20, 20)],
        },
      })
      .on("slide", handleChange);

    node?.noUiSlider.on("start", () => setIsDragging(true));
    node?.noUiSlider.on("end", () => setIsDragging(false));
  };

  const handleChange = (val: number[]) => {
    onChange(Number(val[0]));
    setValue(Number(val[0]));
  };

  return <div ref={divRef} />;
};

export const AbbreviatedEthereumAddress = ({
  address,
}: {
  address: string;
}) => {
  if (address?.length < 14) return <>{`${address}`}</>;
  return <>{`${address?.slice(0, 4)}...${address?.slice(-6)}`}</>;
};

// Avoid exponential notation for very small numbers
const ensureTinyNumberFormatting = (num: number) => {
  if (!num || num > 0.000001) return num;
  const decimalsPart = num?.toString()?.split(".")?.[1] || "";
  const eDecimals = Number(decimalsPart?.split("e-")?.[1]) || 0;
  const countOfDecimals = decimalsPart.length + eDecimals;
  return Number(num).toFixed(countOfDecimals);
};
