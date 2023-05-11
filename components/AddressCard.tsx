import { ReactElement, memo, useEffect, useRef, useState } from 'react';
import ethers from 'ethers';
import { formatNumber, formatMoney, unformat } from 'accounting';

import {
  Center,
  Group,
  Text,
  Title,
  Grid,
  TextInput,
  Slider,
  Paper,
  Divider,
  Container,
  ActionIcon,
  Mark,
  Button,
  Tooltip,
  Checkbox,
  Skeleton,
} from '@mantine/core';
import { FaAsterisk, FaInfinity } from 'react-icons/fa';
import { RxReset } from 'react-icons/rx';
import { IoLogoUsd } from 'react-icons/io';
import { ImmutableArray, ImmutableObject } from '@hookstate/core';
import { TbArrowsMoveHorizontal } from 'react-icons/tb';
import AddAssetDialog from './AddAssetDialog';
import {
  useAaveData,
  HealthFactorData,
  ReserveAssetDataItem,
  BorrowedAssetDataItem,
  markets,
} from '../hooks/useAaveData';

type Props = {};

const AddressCard = ({ }: Props) => {
  const { addressData, currentMarket } = useAaveData('');
  const data = addressData?.[currentMarket];

  return (
    <div style={{ marginTop: '15px' }}>
      <HealthFactorAddressSummary addressData={addressData} />
      <HealthFactorSummary data={data} />
      <UserReserveAssetList />
      <UserBorrowedAssetList />
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

type HealthFactorSummaryInputProps = {
  data: ImmutableObject<HealthFactorData>;
};

const HealthFactorSummary = ({ data }: HealthFactorSummaryInputProps) => {
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

  const healthFactor: ReactElement =
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
    <Paper pb={5} style={{ position: 'sticky', top: '0', zIndex: '5' }}>
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
            <Mark ml="4px" mr="2px">
              <Text span pl="2px" pr="2px">
                {healthFactor}
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
      <Divider my="sm" variant="dashed" />
    </Paper>
  );
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

type UserReserveAssetListProps = {};

const UserReserveAssetList = ({ }: UserReserveAssetListProps) => {
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
      <Divider my="sm" variant="dashed" />
    </div>
  );
};

type UserBorrowedAssetListProps = {};

const UserBorrowedAssetList = ({ }: UserBorrowedAssetListProps) => {
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
      <Divider my="sm" variant="dashed" />
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
    const iconName = assetSymbol.toLowerCase().replace('.e', '').replace('.b', '').replace('m.', '');
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
        value={workingQuantity}
        label={null}
        thumbLabel={`${assetSymbol} Quantity Slider`}
        min={0}
        max={Math.max((lastInputValue || 1) * 10, 10)}
        size="md"
        onChange={(value) => handleChange(Number(value), true)}
        style={{ pointerEvents: 'none' }}
        styles={{ thumb: { borderWidth: 1, padding: 0, fontSize: '28px' } }}
        thumbSize={32}
        thumbChildren={<TbArrowsMoveHorizontal style={{ pointerEvents: 'all' }} />}
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
      inputRef.current.value !== formatMoney(workingPrice, '')
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
        value={workingPrice}
        label={null}
        thumbLabel={`${assetSymbol} Price Slider`}
        min={0}
        max={(lastInputValue || 1) * 10}
        size="md"
        onChange={handleSliderChange}
        style={{ pointerEvents: 'none' }}
        styles={{ thumb: { borderWidth: 1, padding: 0, fontSize: '28px' } }}
        thumbSize={32}
        thumbChildren={<TbArrowsMoveHorizontal style={{ pointerEvents: 'all' }} />}
      />
    </>
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
