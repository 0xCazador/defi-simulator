import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  UiPoolDataProvider,
  UiPoolDataProviderContext,
  UiIncentiveDataProvider,
  UiIncentiveDataProviderContext,
} from "@aave/contract-helpers";
import dayjs from "dayjs";
import {
  ComputedUserReserve,
  FormatUserSummaryResponse,
  formatReserves,
  formatReservesAndIncentives,
  formatUserSummary,
  formatUserSummaryAndIncentives,
} from "@aave/math-utils";
import BigNumber from "bignumber.js";
import {
  AaveHealthFactorData,
  AaveMarketDataType,
  AssetDetails,
  BorrowedAssetDataItem,
  HealthFactorData,
  ReserveAssetDataItem,
  getCalculatedLiquidationScenario,
  markets,
} from "../../../hooks/useAaveData";
import { parseRequestBody } from "../_utils/parseRequestBody";
import { getResolvedAddress } from "../resolver";

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: "Method not allowed." });
    }

    const { address, marketId, blockNumber } = parseRequestBody<{
      address?: string;
      marketId?: string;
      blockNumber?: number;
    }>(_req.body);

    // Validate required parameters
    if (!address || !marketId) {
      return res.status(400).json({
        statusCode: 400,
        message: "Address and marketId are required",
      });
    }

    // Validate block number if provided
    if (blockNumber !== undefined && blockNumber !== null) {
      if (!Number.isInteger(blockNumber) || blockNumber < 0) {
        return res.status(400).json({
          statusCode: 400,
          message: "Block number must be a non-negative integer",
        });
      }
    }

    const market = markets.find((m: AaveMarketDataType) => m.id === marketId);

    if (!market) {
      return res.status(400).json({
        statusCode: 400,
        message: `Market not found: ${marketId}`,
      });
    }

    const data: HealthFactorData = await getAaveData(
      address,
      market,
      blockNumber
    );
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export const getAaveData = async (
  address: string,
  market: AaveMarketDataType,
  blockNumber?: number
) => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId
  );
  const hasHistoricalBlock = blockNumber !== undefined && blockNumber !== null;

  const effectiveProvider = hasHistoricalBlock
    ? Object.assign(Object.create(provider), {
        call: (
          transaction: ethers.providers.TransactionRequest,
          _blockTag?: ethers.providers.BlockTag
        ) => provider.call(transaction, blockNumber),
      })
    : provider;

  const UiPoolDataCtx: UiPoolDataProviderContext = {
    uiPoolDataProviderAddress: market.addresses.UI_POOL_DATA_PROVIDER,
    provider: effectiveProvider,
    chainId: market.chainId,
  };
  const poolDataProviderContract = new UiPoolDataProvider(UiPoolDataCtx);

  const UiIncentiveDataCtx: UiIncentiveDataProviderContext = {
    uiIncentiveDataProviderAddress: market.addresses.UI_INCENTIVE_DATA_PROVIDER,
    provider: effectiveProvider,
    chainId: market.chainId,
  };

  const incentiveDataProviderContract = new UiIncentiveDataProvider(
    UiIncentiveDataCtx
  );

  const user =
    (await getResolvedAddress(address)) ||
    "0x87cCC67f0c1b67745989542152DD4acff3841CD6";

  let currentBlockNumber = blockNumber;
  if (!hasHistoricalBlock) {
    currentBlockNumber = await provider.getBlockNumber();
  }

  const [reserves, userReserves, reserveIncentives, userIncentives] =
    await Promise.all([
      poolDataProviderContract.getReservesHumanized({
        lendingPoolAddressProvider:
          market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
      }),
      poolDataProviderContract.getUserReservesHumanized({
        lendingPoolAddressProvider:
          market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
        user,
      }),
      incentiveDataProviderContract.getReservesIncentivesDataHumanized({
        lendingPoolAddressProvider:
          market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
      }),
      incentiveDataProviderContract.getUserReservesIncentivesDataHumanized({
        lendingPoolAddressProvider:
          market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
        user,
      }),
    ]);

  const reservesArray = reserves.reservesData;
  const { baseCurrencyData } = reserves;
  const userReservesArray = userReserves.userReserves;

  const currentTimestamp = dayjs().unix();

  const formattedPoolReserves = formatReservesAndIncentives({
    reserves: reservesArray,
    currentTimestamp,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    reserveIncentives,
  });

  const userSummary = formatUserSummaryAndIncentives({
    currentTimestamp,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    userReserves: userReservesArray,
    formattedReserves: formattedPoolReserves,
    userEmodeCategoryId: userReserves.userEmodeCategoryId,
    reserveIncentives,
    userIncentives,
  });

  const hf: HealthFactorData = aaveUserSummaryToHealthFactor(
    userSummary,
    address,
    user, // if address is an ens, user will point to the resolved address.
    market,
    baseCurrencyData,
    userReserves.userEmodeCategoryId,
    hasHistoricalBlock ? currentBlockNumber : undefined,
    currentBlockNumber
  );
  return hf;
};

const aaveUserSummaryToHealthFactor = (
  userSummary: FormatUserSummaryResponse,
  address: string,
  resolvedAddress: string,
  market: AaveMarketDataType,
  baseCurrencyData: any,
  userEmodeCategoryId: number,
  blockNumber?: number,
  fetchedBlockNumber?: number
) => {
  const getAssetDetailsFromReserveItem = (reserveItem: ComputedUserReserve) => {
    const { reserve } = reserveItem;
    const details: AssetDetails = {
      symbol: reserve.symbol,
      name: reserve.name,
      priceInUSD: Number(reserve.priceInUSD),
      priceInMarketReferenceCurrency: new BigNumber(
        reserve.priceInMarketReferenceCurrency
      )
        .shiftedBy(baseCurrencyData.marketReferenceCurrencyDecimals * -1)
        .toNumber(),
      baseLTVasCollateral: Number(reserve.baseLTVasCollateral),
      reserveFactor: Number(reserve.reserveFactor),
      usageAsCollateralEnabled: reserve.usageAsCollateralEnabled,
      reserveLiquidationThreshold: Number(reserve.reserveLiquidationThreshold),
      initialPriceInUSD: Number(reserve.priceInUSD),
      aTokenAddress: reserve.aTokenAddress,
      stableDebtTokenAddress: reserve.stableDebtTokenAddress,
      variableDebtTokenAddress: reserve.variableDebtTokenAddress,
      underlyingAsset: reserve.underlyingAsset,
      flashLoanEnabled: reserve.flashLoanEnabled,
      borrowingEnabled: reserve.borrowingEnabled,
      isFrozen: reserve.isFrozen,
      isPaused: reserve.isPaused,
      isActive: reserve.isActive,
      supplyAPY: Number(reserve.supplyAPY),
      variableBorrowAPY: Number(reserve.variableBorrowAPY),
      stableBorrowAPY: Number(reserve.stableBorrowAPY),
      supplyAPR: Number(reserve.supplyAPR),
      variableBorrowAPR: Number(reserve.variableBorrowAPR),
      stableBorrowAPR: Number(reserve.stableBorrowAPR),
      availableLiquidity: Number(reserve.availableLiquidity),
      borrowCap: Number(reserve.borrowCap),
      supplyCap: Number(reserve.supplyCap),
      eModeLtv: Number(reserve.eModeLtv),
      eModeLiquidationThreshold: Number(reserve.eModeLiquidationThreshold),
      eModeCategoryId: Number(reserve.eModeCategoryId),
      eModeLabel: reserve.eModeLabel,
      borrowableInIsolation: Boolean(reserve.borrowableInIsolation),
      isSiloedBorrowing: Boolean(reserve.isSiloedBorrowing),
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
    totalBorrowsMarketReferenceCurrency: Number(
      userSummary?.totalBorrowsMarketReferenceCurrency
    ),
    currentLiquidationThreshold: Number(
      userSummary?.currentLiquidationThreshold
    ),
    currentLoanToValue: Number(userSummary?.currentLoanToValue),
    userReservesData: userSummary?.userReservesData
      ?.filter(
        (reserveItem: ComputedUserReserve) =>
          reserveItem?.underlyingBalance &&
          reserveItem.underlyingBalance !== "0"
      )
      .map((reserveItem: ComputedUserReserve) => {
        const item: ReserveAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          underlyingBalance: Number(reserveItem.underlyingBalance),
          underlyingBalanceUSD: Number(reserveItem.underlyingBalanceUSD),
          underlyingBalanceMarketReferenceCurrency: Number(
            reserveItem.underlyingBalanceMarketReferenceCurrency
          ),
          usageAsCollateralEnabledOnUser:
            reserveItem.usageAsCollateralEnabledOnUser,
        };
        return item;
      }),
    userBorrowsData: userSummary?.userReservesData
      ?.filter(
        (reserveItem: ComputedUserReserve) =>
          reserveItem?.totalBorrows && reserveItem.totalBorrows !== "0"
      )
      .map((reserveItem: ComputedUserReserve) => {
        const item: BorrowedAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          stableBorrows: Number(reserveItem.stableBorrows),
          variableBorrows: Number(reserveItem.variableBorrows),
          totalBorrowsUSD: Number(reserveItem.totalBorrowsUSD),
          totalBorrows: Number(reserveItem.totalBorrows),
          stableBorrowAPY: Number(reserveItem.stableBorrowAPY),
          totalBorrowsMarketReferenceCurrency: Number(
            reserveItem.totalBorrowsMarketReferenceCurrency
          ),
        };

        return item;
      }),
    userEmodeCategoryId,
    isInIsolationMode: userSummary.isInIsolationMode,
  };
  const reserveDataCopy = { ...reserveData };

  const marketReferenceCurrencyPriceInUSD = new BigNumber(
    baseCurrencyData.marketReferenceCurrencyPriceInUsd
  )
    .shiftedBy(-8)
    .toNumber();

  const fetchedData = {
    healthFactor: reserveData.healthFactor,
    totalBorrowsUSD: reserveData.totalBorrowsUSD,
    availableBorrowsUSD: reserveData.availableBorrowsUSD,
    totalCollateralMarketReferenceCurrency:
      reserveData.totalCollateralMarketReferenceCurrency,
    totalBorrowsMarketReferenceCurrency:
      reserveData.totalBorrowsMarketReferenceCurrency,
    currentLiquidationThreshold: reserveData.currentLiquidationThreshold,
    currentLoanToValue: reserveData.currentLoanToValue,
    userReservesData: reserveData.userReservesData,
    userBorrowsData: reserveData.userBorrowsData,
    userEmodeCategoryId: reserveData.userEmodeCategoryId,
    isInIsolationMode: reserveData.isInIsolationMode,
    txHistory: {
      data: [],
      isFetching: false,
      fetchError: "",
      lastFetched: 0,
    },
  };

  const hf: HealthFactorData = {
    address,
    resolvedAddress,
    fetchError: "",
    isFetching: false,
    lastFetched: Date.now(),
    market,
    marketReferenceCurrencyPriceInUSD,
    availableAssets: userSummary.userReservesData.map((asset) =>
      getAssetDetailsFromReserveItem(asset)
    ),
    fetchedData,
    workingData: JSON.parse(JSON.stringify(fetchedData)),
    selectedBlockNumber: blockNumber,
    fetchedBlockNumber,
  };
  const liquidationScenario = getCalculatedLiquidationScenario(
    hf.workingData as AaveHealthFactorData,
    marketReferenceCurrencyPriceInUSD
  );
  if (hf.workingData) {
    (hf.workingData as any).liquidationScenario = liquidationScenario;
  }
  return hf;
};

export default handler;
