import { ReactElement, RefObject, memo, useEffect, useRef, useState } from 'react';
import { formatNumber, formatMoney, unformat } from 'accounting';
import noUiSlider from 'nouislider';

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
} from '@mantine/core';
import { FaAsterisk, FaInfinity, FaInfoCircle } from 'react-icons/fa';
import { RxReset } from 'react-icons/rx';
import { IoLogoUsd } from 'react-icons/io';
import { ImmutableArray, ImmutableObject } from '@hookstate/core';
import AddAssetDialog from './AddAssetDialog';

import {
  useAaveData,
  HealthFactorData,
  ReserveAssetDataItem,
  BorrowedAssetDataItem,
  markets,
  getHealthFactorColor,
  getIconNameFromAssetSymbol,
  AssetDetails,
  getCalculatedLiquidationScenario
} from '../hooks/useAaveData';
import { BsChevronDown, BsChevronUp } from 'react-icons/bs';
import { AaveHealthFactorData } from '../hooks/useAaveData';
import { FiAlertTriangle } from 'react-icons/fi';

type Props = {};

const AddressCard = ({ }: Props) => {
  const { addressData, currentMarket, applyLiquidationScenario, isFetching } = useAaveData('');
  const data = addressData?.[currentMarket];
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryOffset: number = summaryRef?.current?.clientHeight || 0;
  const isEmode: boolean = (data?.workingData?.userEmodeCategoryId || 0) !== 0;

  return (
    <div style={{ marginTop: '15px' }} >
      <HealthFactorAddressSummary addressData={addressData} />
      <div style={{ zIndex: '6', backgroundColor: "#1A1B1E" }}>
        {isEmode ? (
          <>
            <Alert
              mb={15}
              mt={45}
              icon={<FiAlertTriangle size="1rem" />}
              title="Emode Not Supported!"
              color="red"
              variant="outline"
            >
              This debt position has Emode (Efficieny Mode) enabled, but DeFi Simulator does not yet support positions with Emode enabled. We hope to add support for Emode soon.
            </Alert>
            <HealthFactorSkeleton animate={false} />
          </>
        ) : (
          <>
            {
              isFetching
                ? <HealthFactorSkeleton animate />
                : (
                  <>
                    <HealthFactorSummary summaryRef={summaryRef} data={data} />
                    <LiquidationScenario data={data} applyLiquidationScenario={applyLiquidationScenario} />
                    <UserReserveAssetList summaryOffset={summaryOffset} />
                    <Space h="xl" />
                    <Space h="xl" />
                    <UserBorrowedAssetList summaryOffset={summaryOffset} />
                  </>
                )
            }
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

export const HealthFactorAddressSummary = ({ addressData }: HealthFactorAddressSummaryProps) => {
  const { isFetching, currentAddress } = useAaveData('');
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
          <Text size="sm" style={{ display: 'inline-block' }}>
            <AbbreviatedEthereumAddress address={currentAddress} />
            {`: Found Aave ${count === 1 ? 'position' : 'positions'} in ${count} ${count === 1 ? 'market' : 'markets'}.`}
          </Text>
        ) : (
          <Text size="sm" style={{ display: 'inline-block' }}>
            <AbbreviatedEthereumAddress address={currentAddress} />: No Aave positions found.
          </Text>
        )}
      </Center>

      <Center>
        <Text size="sm" ta="center" mt="md">
          Add, remove, and modify asset prices/quantities below to visualize changes to health
          factor and borrowing power.
        </Text>
      </Center>
    </>
  );
};

type HealthFactorSkeletonProps = {
  animate?: boolean;
};

export const HealthFactorSkeleton = ({ animate }: HealthFactorSkeletonProps) => {
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
        <Grid.Col lg={3} xs={6} style={{ textAlign: 'center' }}>
          <Paper>
            <Text fz="xs">{'Total Borrowed: '}</Text>
            <Skeleton height={45} mb="xl" animate={animate} />
          </Paper>
        </Grid.Col>
        <Grid.Col lg={3} xs={6} style={{ textAlign: 'center' }}>
          <Text fz="xs">{'Available to Borrow: '}</Text>
          <Skeleton height={45} mb="xl" animate={animate} />
        </Grid.Col>
        <Grid.Col lg={3} xs={6} style={{ textAlign: 'center' }}>
          <Paper>
            <Text fz="xs">{'Reserve Asset Value: '}</Text>
            <Skeleton height={45} mb="xl" animate={animate} />
          </Paper>
        </Grid.Col>
        <Grid.Col lg={3} xs={6} style={{ textAlign: 'center' }}>
          <Text fz="xs">{'Net Asset Value: '}</Text>
          <Skeleton height={45} mb="xl" animate={animate} />
        </Grid.Col>
      </Grid>
      <Divider my="sm" variant="dashed" />
      {items.map((item) => (
        <Paper shadow="xs" sx={{ marginBottom: '50px' }} key={item}>
          <Skeleton height={20} width={175} mb="xl" animate={animate} />

          <Grid columns={17}>
            <Grid.Col span={8}>
              <Skeleton height={55} mb="xl" animate={animate} />
            </Grid.Col>
            <Grid.Col span={1}>
              <Center sx={{ height: '100%' }}>
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
  summaryRef: RefObject<HTMLDivElement>
};

const HealthFactorSummary = ({ data, summaryRef }: HealthFactorSummaryProps) => {
  if (data?.isFetching) return <HealthFactorSkeleton animate />;

  if (!data) {
    return (
      <Center mt={30}>
        <Text>
          Something happened, we're not able to load the address CDP data right now. Try again
          later.
        </Text>
      </Center>
    );
  }

  const addressHasPosition: boolean = (data.fetchedData?.healthFactor || -1) > -1;

  const originalHealthFactorDisplayable: string = formatNumber(
    Math.max(data.fetchedData?.healthFactor || 0, 0),
    2
  );

  const hfColor: string = getHealthFactorColor(data.workingData?.healthFactor || 0);

  const healthFactorElem: ReactElement =
    data.workingData?.healthFactor === Infinity ? (
      <Center inline>
        <FaInfinity size={24} style={{ paddingTop: '8px' }} />
      </Center>
    ) : (
      <span>{formatNumber(Math.max(data.workingData?.healthFactor || 0, 0), 2)}</span>
    );
  const healthFactorDiffers: boolean = addressHasPosition &&
    (data.workingData?.healthFactor?.toFixed(2) !== data.fetchedData?.healthFactor?.toFixed(2));

  const originalTotalBorrowsUSD: string = formatMoney(data.fetchedData?.totalBorrowsUSD ?? 0);
  const totalBorrowsUSD: string = formatMoney(data.workingData?.totalBorrowsUSD ?? 0);
  const totalBorrowsDiffers: boolean = addressHasPosition &&
    (data.fetchedData?.totalBorrowsUSD?.toFixed(2) !== data.workingData?.totalBorrowsUSD?.toFixed(2));

  const originalAvailableBorrowsUSD: string = formatMoney(
    Math.max(data.fetchedData?.availableBorrowsUSD ?? 0, 0)
  );
  const availableBorrowsUSD: string = formatMoney(
    Math.max(data.workingData?.availableBorrowsUSD ?? 0, 0)
  );
  const availableBorrowsDiffers: boolean = addressHasPosition &&
    (data.fetchedData?.availableBorrowsUSD?.toFixed(2) !==
      data.workingData?.availableBorrowsUSD?.toFixed(2));

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
  const originalTotalCollateralUSDFormatted: string = formatMoney(originalTotalCollateralUSD);
  const totalCollateralUSDFormatted: string = formatMoney(totalCollateralUSD);
  const totalCollateralDiffers: boolean = addressHasPosition &&
    (originalTotalCollateralUSD?.toFixed(2) !== totalCollateralUSD?.toFixed(2));

  const originalNetValueUSD: string = formatMoney(
    originalTotalCollateralUSD - (data.fetchedData?.totalBorrowsUSD ?? 0)
  );
  const netValueUSD: string = formatMoney(
    totalCollateralUSD - (data.workingData?.totalBorrowsUSD ?? 0)
  );
  const netValueUSDDiffers: boolean = addressHasPosition &&
    ((originalTotalCollateralUSD - (data.fetchedData?.totalBorrowsUSD ?? 0)).toFixed(2) !==
      (totalCollateralUSD - (data.workingData?.totalBorrowsUSD ?? 0)).toFixed(2));

  return (
    <div ref={summaryRef} style={{ position: 'sticky', top: '0', zIndex: '5' }}>
      <Paper pb={5} >
        <Divider
          my="sm"
          variant="dashed"
          labelPosition="center"
          label={
            <Title order={3}>
              {'Health Factor: '}
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
          <Grid.Col lg={3} xs={6} style={{ textAlign: 'center', minHeight: '78px' }}>
            <Paper>
              <Text fz="xs">{'Total Borrowed: '}</Text>
              {totalBorrowsDiffers && (
                <Text fz="xs" c="dimmed">
                  {originalTotalBorrowsUSD} ➔
                </Text>
              )}
              <Text span fw={700} fz="md" mb={20}>
                {totalBorrowsUSD}
              </Text>
            </Paper>
          </Grid.Col>
          <Grid.Col lg={3} xs={6} style={{ textAlign: 'center' }}>
            <Text fz="xs">{'Available to Borrow: '}</Text>
            {availableBorrowsDiffers && (
              <Text fz="xs" c="dimmed">
                {originalAvailableBorrowsUSD} ➔
              </Text>
            )}
            <Text span fw={700} fz="md">
              {availableBorrowsUSD}
            </Text>
          </Grid.Col>
          <Grid.Col lg={3} xs={6} style={{ textAlign: 'center', minHeight: '78px' }}>
            <Paper>
              <Text fz="xs">{'Reserve Asset Value: '}</Text>
              {totalCollateralDiffers && (
                <Text fz="xs" c="dimmed">
                  {originalTotalCollateralUSDFormatted} ➔
                </Text>
              )}
              <Text span fw={700} fz="md">
                {totalCollateralUSDFormatted}
              </Text>
            </Paper>
          </Grid.Col>
          <Grid.Col lg={3} xs={6} style={{ textAlign: 'center' }}>
            <Text fz="xs">{'Net Asset Value: '}</Text>
            {netValueUSDDiffers && (
              <Text fz="xs" c="dimmed">
                {originalNetValueUSD} ➔
              </Text>
            )}
            <Text span fw={700} fz="md">
              {netValueUSD}
            </Text>
          </Grid.Col>
        </Grid>
      </Paper>
    </div>
  );
};

type LiquidationScenarioProps = {
  data: ImmutableObject<HealthFactorData>;
  applyLiquidationScenario: () => void;
};

const LiquidationScenario = ({
  data,
  applyLiquidationScenario
}: LiquidationScenarioProps) => {
  const [showLiquidation, setShowLiquidation] = useState(false);

  if (data?.isFetching) return null;

  const scenario: AssetDetails[] = getCalculatedLiquidationScenario(
    data?.workingData as AaveHealthFactorData,
    data?.marketReferenceCurrencyPriceInUSD);

  if (!scenario?.length) return <Divider my="sm" variant="dashed" label="No Liquidation Scenario Available" labelPosition="center" />;

  return (
    <>
      <Divider variant="dashed"
        my="sm"
        labelPosition="center"
        label={
          <>
            <Button
              variant="subtle"
              color="gray"
              compact
              onClick={() => setShowLiquidation(!showLiquidation)}
              rightIcon={showLiquidation ? <BsChevronUp /> : <BsChevronDown />}>
              Price Liquidation Scenario
            </Button>
          </>
        }
        style={{ backgroundColor: "#1A1B1E" }}
      />
      <Transition mounted={showLiquidation} transition="slide-down" duration={1600} exitDuration={0} timingFunction="ease">
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
                  <ActionIcon style={{ display: 'inline-block' }}>
                    <FaInfoCircle size={18} />
                  </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                  <Text size="sm">The liquidation scenario represents the approximate highest reserve asset prices that could subject the position to liquidation. Stable assets are not included in this scenario and are assumed to maintain their present value. Many factors affect liquidation. This scenario is only one example for reference. Many different scenarios can trigger liquidation.
                    <a href="https://docs.aave.com/faq/liquidations" target="_blank" rel="noreferrer" style={{ color: "#e9ecef" }}>
                      {" Read more here"}
                    </a>
                    {"."}
                  </Text>
                </Popover.Dropdown>
              </Popover>
              {
                scenario.map(liqAsset => {
                  const workingAsset = data.workingData?.userReservesData.find(reserve => reserve.asset.symbol === liqAsset.symbol)?.asset;
                  const currentAssetPrice = workingAsset ? workingAsset.priceInUSD : liqAsset.initialPriceInUSD;

                  const diff = currentAssetPrice - liqAsset.priceInUSD;

                  const change = Math.round((diff * 100) / currentAssetPrice) * -1;
                  //console.log({ existingAsset: workingAsset, currentAssetPrice, change })
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
                      leftSection={avatar}>
                      <Text span>
                        {`${liqAsset.symbol}: `}
                        {`${formatMoney(liqAsset.priceInUSD)}`}
                      </Text>
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

                  )

                })
              }
              <Button variant="subtle" color="gray" compact onClick={applyLiquidationScenario}>
                Apply
              </Button>
            </Flex>
          )
        }}
      </Transition>
      {showLiquidation && <Divider my="sm" variant="dashed" />}

    </>

  )
};

const ResetMarketButton = ({ }) => {
  const { addressData, currentMarket, resetCurrentMarketChanges } = useAaveData('');
  const data = addressData?.[currentMarket];

  let isAnyModified: boolean = false;

  if (data.workingData?.userReservesData.length !== data.fetchedData?.userReservesData.length) {
    isAnyModified = true;
  }

  if (data.workingData?.userBorrowsData.length !== data.fetchedData?.userBorrowsData.length) {
    isAnyModified = true;
  }

  if (data.workingData?.healthFactor !== data.fetchedData?.healthFactor) {
    isAnyModified = true;
  }

  if (!isAnyModified) return null;

  return (
    <Tooltip label="Reset all simulated values" position="top-end" withArrow>
      <ActionIcon style={{ display: 'inline-block' }}>
        <RxReset size={18} onClick={resetCurrentMarketChanges} />
      </ActionIcon>
    </Tooltip>
  );
};

type UserReserveAssetListProps = {
  summaryOffset: number
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
  } = useAaveData('');
  const items: ImmutableArray<ReserveAssetDataItem> =
    addressData?.[currentMarket]?.workingData?.userReservesData || [];

  const market = markets.find((market) => market.id === currentMarket);

  return (
    <div style={{ marginTop: '15px' }}>
      <Container
        style={{
          marginTop: '15px',
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0px',
          position: 'sticky',
          top: `${summaryOffset}px`,
          zIndex: '4',
          backgroundColor: "#1A1B1E"
        }}
      >
        <Title order={4} sx={{ marginBottom: '10px' }}>
          Reserve Assets
        </Title>
        <AddAssetDialog assetType="RESERVE" />
      </Container>
      {items.length === 0 && (
        <Center>
          <Text fz="sm" m={25} align="center">
            {'There are no reserve assets for '}
            <AbbreviatedEthereumAddress address={currentAddress} />
            {` in the ${market?.title} market. Select "Add Reserve Asset" to simulate reserve assets for this address.`}
          </Text>
        </Center>
      )}
      {items.map((item) => {
        const originalAsset = addressData?.[currentMarket]?.fetchedData?.userReservesData?.find(
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
            disableSetUseReserveAssetAsCollateral={!item.asset.usageAsCollateralEnabled}
            isNewlyAddedBySimUser={!!item.asset.isNewlyAddedBySimUser}
          />
        );
      })}
    </div>
  );
};

type UserBorrowedAssetListProps = {
  summaryOffset: number
};

const UserBorrowedAssetList = ({ summaryOffset }: UserBorrowedAssetListProps) => {
  const {
    addressData,
    currentMarket,
    currentAddress,
    addBorrowAsset,
    removeAsset,
    setAssetPriceInUSD,
    setBorrowedAssetQuantity,
  } = useAaveData('');
  const items: ImmutableArray<BorrowedAssetDataItem> =
    addressData?.[currentMarket]?.workingData?.userBorrowsData || [];

  const market = markets.find((market) => market.id === currentMarket);

  return (
    <div style={{ marginTop: '15px' }}>
      <Container
        style={{
          marginTop: '15px',
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0px',
          position: 'sticky',
          top: `${summaryOffset}px`,
          zIndex: '3',
          backgroundColor: "#1A1B1E"
        }}
      >
        <Title order={4} sx={{ marginBottom: '10px' }}>
          Borrowed Assets
        </Title>
        <AddAssetDialog assetType="BORROW" />
      </Container>
      {items.length === 0 && (
        <Center>
          <Text fz="sm" m={25} align="center">
            {'There are no borrowed assets for '}
            <AbbreviatedEthereumAddress address={currentAddress} />
            {` in the ${market?.title} market. Select "Add Borrow Asset" to simulate borrowed assets for this address.`}
          </Text>
        </Center>
      )}
      {items.map((item) => {
        const originalAsset = addressData?.[currentMarket]?.fetchedData?.userBorrowsData?.find(
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
          />
        );
      })}
    </div>
  );
};

const UserAssetItemPropsChecker = (oldProps: UserAssetItemProps, newProps: UserAssetItemProps) => {
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
    oldProps.assetSymbol === newProps.assetSymbol;

  return arePropsEqual;
};

type UserAssetItemProps = {
  assetSymbol: string;
  usageAsCollateralEnabledOnUser: boolean;
  assetType: 'RESERVE' | 'BORROW';
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
      <Paper shadow="xs" sx={{ marginBottom: '30px' }}>
        <Group>
          <Text fz="md" fw={700}>
            {assetSymbol}
          </Text>
          <img
            src={`/icons/tokens/${iconName}.svg`}
            width="32px"
            height="32px"
            alt={`${assetSymbol}`}
          />
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
            <Center sx={{ height: '100%' }}>
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
          style={{
            marginTop: '15px',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0px',
          }}
        >
          <UserAssetItemQuantityPriceSummary
            workingQuantity={workingQuantity}
            workingPrice={workingPrice}
            originalQuantity={originalQuantity}
            originalPrice={originalPrice}
          />
          <Button compact variant="light" onClick={() => onRemoveAsset(assetSymbol, assetType)}>
            {`Remove ${assetSymbol}`}
          </Button>
        </Container>
        {assetType === 'RESERVE' && (
          <UserAssetUseAsCollateralToggle
            assetSymbol={assetSymbol}
            usageAsCollateralEnabledOnUser={usageAsCollateralEnabledOnUser}
            setUseReserveAssetAsCollateral={setUseReserveAssetAsCollateral}
            disableSetUseReserveAssetAsCollateral={disableSetUseReserveAssetAsCollateral}
          />
        )}
        <Divider variant="dashed" mt="xl" />
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
        <Text fz="xs" c="dimmed" style={{ display: 'block' }}>
          {`= ${formatMoney(originalValue)} ➔`}
        </Text>
      )}
      <Text mt={valuedDiffers ? 0 : 19} style={{ display: 'block' }}>
        {`= ${formatMoney(workingValue)} (USD)`}
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
      ? setUseReserveAssetAsCollateral(assetSymbol, !usageAsCollateralEnabledOnUser)
      : null;
  };

  return (
    <Checkbox
      disabled={disableSetUseReserveAssetAsCollateral}
      size="sm"
      checked={usageAsCollateralEnabledOnUser}
      label={`Use ${assetSymbol} as collateral`}
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
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
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
        value={ensureTinyNumberFormatting(workingQuantity) || ''}
        label={`${assetSymbol} Quantity`}
        labelProps={{ size: 'sm' }}
        onChange={(e) => handleChange(Number(e.target.value))}
        size="md"
        type="number"
        inputWrapperOrder={['label', 'error', 'input', 'description']}
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

  return (
    <Tooltip label={`Reset to Original Value (${ensureTinyNumberFormatting(originalValue)})`} position="top-end" withArrow>
      <ActionIcon>
        <RxReset size={18} style={{ display: 'block' }} onClick={onClick} />
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
  const [lastInputValue, setLastInputValue] = useState(workingPrice); // used to set slider to intuitive range

  useEffect(() => {
    // the input is uncontrolled, but we need to support external "reset" functionality
    if (
      inputRef.current &&
      inputRef.current.value !== formatMoney(workingPrice, '') &&
      inputRef.current !== document.activeElement // if input is focused, don't apply formatting
    ) {
      inputRef.current.value = formatMoney(workingPrice, '');
    }
  }, [workingPrice]);

  const handleReset = () => {
    const inputNode = inputRef.current as any;
    inputNode.value = formatMoney(originalPrice, '');
    handleChange(originalPrice);
  };

  const handleChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingPrice) return;
    setLastInputValue(value);
    setAssetPriceInUSD(assetSymbol, value);
  };

  const handleSliderChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingPrice) return;
    setAssetPriceInUSD(assetSymbol, value);
    const inputNode = inputRef.current as any;
    inputNode.value = formatMoney(value, '');
  };

  const handleBlur = () => {
    const inputNode = inputRef.current as any;
    inputNode.value = formatMoney(workingPrice, '');
  };

  const resetIcon = (
    <ResetInputValueIcon
      originalValue={originalPrice}
      workingValue={workingPrice}
      onClick={handleReset}
    />
  );

  return (
    <>
      <TextInput
        defaultValue={formatMoney(workingPrice, '')}
        label={`${assetSymbol} Price (USD)`}
        labelProps={{ size: 'sm' }}
        onChange={(e) => handleChange(unformat(e.target.value))}
        onBlur={handleBlur}
        size="md"
        ref={inputRef}
        inputWrapperOrder={['label', 'error', 'input', 'description']}
        rightSection={resetIcon}
        icon={<IoLogoUsd />}
      />
      <Slider
        defaultValue={workingPrice}
        onChange={handleSliderChange}
      />
    </>
  );
};

type SliderProps = {
  defaultValue: number,
  onChange: (value: number) => void
};

const Slider = ({
  defaultValue,
  onChange
}: SliderProps) => {
  const [value, setValue] = useState(defaultValue);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => { // initialize the slider
    if (divRef.current?.noUiSlider) return; // already initialized
    createSlider();
  }, []);

  useEffect(() => { // handle external reset or change
    if (value != null && defaultValue != null && defaultValue !== value) {
      createSlider()
    }
  }, [defaultValue, value]);

  const createSlider = () => {
    const node = divRef.current;
    if (node.noUiSlider) {
      node.noUiSlider.destroy();
      node.noUiSlider = null;
    }

    noUiSlider.create(node, {
      start: [defaultValue],
      range: {
        'min': [0],
        '15%': [Math.max(defaultValue * 0.5, 0.5)],
        '50%': [Math.max(defaultValue, 1)],
        '85%': [Math.max(defaultValue * 2, 2)],
        'max': [Math.max(defaultValue * 20, 20)]
      }
    }).on('slide', handleChange);
  }

  const handleChange = (val: number[]) => {
    onChange(Number(val[0]));
    setValue(Number(val[0]));
  }

  return (
    <div ref={divRef} />
  );
};


export const AbbreviatedEthereumAddress = ({ address }: { address: string }) => {
  if (address?.length < 14) return <>{`${address}`}</>;
  return <>{`${address?.slice(0, 4)}...${address?.slice(-6)}`}</>;
};

// Avoid exponential notation for very small numbers
const ensureTinyNumberFormatting = (num: number) => {
  if (!num || num > 0.000001) return num;
  const decimalsPart = num?.toString()?.split('.')?.[1] || '';
  const eDecimals = Number(decimalsPart?.split('e-')?.[1]) || 0;
  const countOfDecimals = decimalsPart.length + eDecimals;
  return Number(num).toFixed(countOfDecimals);
};
