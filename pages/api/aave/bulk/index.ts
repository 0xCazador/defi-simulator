import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { PoolBaseCurrencyHumanized, UiPoolDataProvider, UiPoolDataProviderContext } from '@aave/contract-helpers';
import dayjs from 'dayjs';
import {
  ComputedUserReserve,
  FormatUserSummaryResponse,
  formatReserves,
  formatUserSummary,
} from '@aave/math-utils';
import BigNumber from 'bignumber.js';
import {
  AaveMarketDataType,
  AssetDetails,
  BorrowedAssetDataItem,
  HealthFactorData,
  ReserveAssetDataItem,
  markets,
} from '../../../../hooks/useAaveData';

const allowedMethods = ['POST', 'OPTIONS'];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  const timer = (ms: number | undefined) => new Promise((res) => setTimeout(res, ms));

  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: 'Method not allowed.' });
    }
    const isAbbreviated = !!_req.query.abbreviated;
    const { addresses } = JSON.parse(_req.body);
    const { marketId } = JSON.parse(_req.body);
    const market = markets.find((m: AaveMarketDataType) => m.id === marketId) as AaveMarketDataType;
    const data = [];

    for (const address of addresses) {
      const hf = await getAaveData(address, market) as HealthFactorData;
      if (isAbbreviated && hf.workingData) hf.workingData.address = address; // we want the address included with abbrev. data (for generating test data fixtures)
      data.push(isAbbreviated ? hf.workingData : hf);
      await timer(500);
    }
    res.status(200).json(data);
  } catch (err: any) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

const getAaveData = async (address: string, market: AaveMarketDataType) => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api.replace('{{ALCHEMY_API_KEY}}', process.env.ALCHEMY_API_KEY as string),
    market.chainId
  );
  const ctx: UiPoolDataProviderContext = {
    uiPoolDataProviderAddress: market.addresses.UI_POOL_DATA_PROVIDER,
    provider,
    chainId: market.chainId,
  };
  const poolDataProviderContract = new UiPoolDataProvider(ctx);

  const reserves = await poolDataProviderContract.getReservesHumanized({
    lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
  });
  const userReserves = await poolDataProviderContract.getUserReservesHumanized({
    lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
    user: address,
  });
  const reservesArray = reserves.reservesData;
  const { baseCurrencyData } = reserves;
  const userReservesArray = userReserves.userReserves;

  const currentTimestamp = dayjs().unix();

  const formattedPoolReserves = formatReserves({
    reserves: reservesArray,
    currentTimestamp,
    marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
  });

  const userSummary = formatUserSummary({
    currentTimestamp,
    marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
    userReserves: userReservesArray,
    formattedReserves: formattedPoolReserves,
    userEmodeCategoryId: userReserves.userEmodeCategoryId,
  });

  const hf: HealthFactorData = aaveUserSummaryToHealthFactor(
    userSummary,
    address,
    market,
    baseCurrencyData
  );
  return hf;
};

const aaveUserSummaryToHealthFactor = (
  userSummary: FormatUserSummaryResponse,
  address: string,
  market: AaveMarketDataType,
  baseCurrencyData: PoolBaseCurrencyHumanized
) => {
  const getAssetDetailsFromReserveItem = (reserveItem: ComputedUserReserve) => {
    const details: AssetDetails = {
      symbol: reserveItem.reserve.symbol,
      name: reserveItem.reserve.name,
      priceInUSD: Number(reserveItem.reserve.priceInUSD),
      priceInMarketReferenceCurrency: new BigNumber(
        reserveItem.reserve.priceInMarketReferenceCurrency
      )
        .shiftedBy(baseCurrencyData.marketReferenceCurrencyDecimals * -1)
        .toNumber(),
      baseLTVasCollateral: Number(reserveItem.reserve.baseLTVasCollateral),
      reserveFactor: Number(reserveItem.reserve.reserveFactor),
      usageAsCollateralEnabled: reserveItem.reserve.usageAsCollateralEnabled,
      reserveLiquidationThreshold: Number(reserveItem.reserve.reserveLiquidationThreshold),
    };
    return details;
  };

  const reserveData = {
    healthFactor: Number(userSummary?.healthFactor),
    totalBorrowsUSD: Number(userSummary?.totalBorrowsUSD),
    availableBorrowsUSD: Number(userSummary?.availableBorrowsUSD),
    totalCollateralMarketReferenceCurrency: Number(
      userSummary?.totalCollateralMarketReferenceCurrency
    ),
    totalBorrowsMarketReferenceCurrency: Number(userSummary?.totalBorrowsMarketReferenceCurrency),
    currentLiquidationThreshold: Number(userSummary?.currentLiquidationThreshold),
    currentLoanToValue: Number(userSummary?.currentLoanToValue),
    userReservesData: userSummary?.userReservesData
      ?.filter(
        (reserveItem: ComputedUserReserve) =>
          reserveItem?.underlyingBalance && reserveItem.underlyingBalance !== '0'
      )
      .map((reserveItem: ComputedUserReserve) => {
        const item: ReserveAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          underlyingBalance: Number(reserveItem.underlyingBalance),
          underlyingBalanceUSD: Number(reserveItem.underlyingBalanceUSD),
          underlyingBalanceMarketReferenceCurrency: Number(
            reserveItem.underlyingBalanceMarketReferenceCurrency
          ),
          usageAsCollateralEnabledOnUser: reserveItem.usageAsCollateralEnabledOnUser,
        };
        return item;
      }),
    userBorrowsData: userSummary?.userReservesData
      ?.filter(
        (reserveItem: ComputedUserReserve) =>
          reserveItem?.totalBorrows && reserveItem.totalBorrows !== '0'
      )
      .map((reserveItem: ComputedUserReserve) => {
        const item: BorrowedAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          stableBorrows: Number(reserveItem.stableBorrows),
          totalBorrowsUSD: Number(reserveItem.totalBorrowsUSD),
          totalBorrows: Number(reserveItem.totalBorrows),
          totalBorrowsMarketReferenceCurrency: Number(
            reserveItem.totalBorrowsMarketReferenceCurrency
          ),
        };

        return item;
      }),
  };
  const hf: HealthFactorData = {
    address,
    fetchError: '',
    isFetching: false,
    lastFetched: Date.now(),
    market,
    marketReferenceCurrencyPriceInUSD: new BigNumber(
      baseCurrencyData.marketReferenceCurrencyPriceInUsd
    )
      .shiftedBy(-8)
      .toNumber(),
    availableAssets: userSummary.userReservesData.map((asset) =>
      getAssetDetailsFromReserveItem(asset)
    ),
    fetchedData: {
      healthFactor: reserveData.healthFactor,
      totalBorrowsUSD: reserveData.totalBorrowsUSD,
      availableBorrowsUSD: reserveData.availableBorrowsUSD,
      totalCollateralMarketReferenceCurrency: reserveData.totalCollateralMarketReferenceCurrency,
      totalBorrowsMarketReferenceCurrency: reserveData.totalBorrowsMarketReferenceCurrency,
      currentLiquidationThreshold: reserveData.currentLiquidationThreshold,
      currentLoanToValue: reserveData.currentLoanToValue,
      userReservesData: reserveData.userReservesData,
      userBorrowsData: reserveData.userBorrowsData,
    },
    workingData: {
      healthFactor: reserveData.healthFactor,
      totalBorrowsUSD: reserveData.totalBorrowsUSD,
      availableBorrowsUSD: reserveData.availableBorrowsUSD,
      totalCollateralMarketReferenceCurrency: reserveData.totalCollateralMarketReferenceCurrency,
      totalBorrowsMarketReferenceCurrency: reserveData.totalBorrowsMarketReferenceCurrency,
      currentLiquidationThreshold: reserveData.currentLiquidationThreshold,
      currentLoanToValue: reserveData.currentLoanToValue,
      userReservesData: [...reserveData.userReservesData],
      userBorrowsData: [...reserveData.userBorrowsData],
    },
  };
  return hf;
};

export default handler;
