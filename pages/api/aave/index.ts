import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  UiPoolDataProvider,
  UiPoolDataProviderContext,
  UiIncentiveDataProvider,
  UiIncentiveDataProviderContext,
  ReservesIncentiveDataHumanized,
  UserReservesIncentivesDataHumanized
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
  updateDerivedHealthFactorData,
} from "../../../hooks/useAaveData";
import { getResolvedAddress } from "../resolver";
import {
  EModeCategoryData,
  fetchEModeCategories,
  fetchPoolAddress,
  fetchReserveIds,
  resolveEffectiveRiskParams,
} from "../../../utils/liquidEMode";

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: "Method not allowed." });
    }

    const { address } = JSON.parse(_req.body);
    const { marketId } = JSON.parse(_req.body);

    const market = markets.find(
      (m: AaveMarketDataType) => m.id === marketId
    ) as AaveMarketDataType;
    const data: HealthFactorData = await getAaveData(address, market);
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export const getAaveData = async (address: string, market: AaveMarketDataType) => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId
  );

  const UiPoolDataCtx: UiPoolDataProviderContext = {
    uiPoolDataProviderAddress: market.addresses.UI_POOL_DATA_PROVIDER,
    provider,
    chainId: market.chainId,
  };
  const poolDataProviderContract = new UiPoolDataProvider(UiPoolDataCtx);

  const UiIncentiveDataCtx: UiIncentiveDataProviderContext = {
    uiIncentiveDataProviderAddress: market.addresses.UI_INCENTIVE_DATA_PROVIDER,
    provider,
    chainId: market.chainId,
  };

  const incentiveDataProviderContract = new UiIncentiveDataProvider(UiIncentiveDataCtx);

  const user = (await getResolvedAddress(address)) || "0x87cCC67f0c1b67745989542152DD4acff3841CD6";

  const [reserves, userReserves] = await Promise.all([
    poolDataProviderContract.getReservesHumanized({
      lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
    }),
    poolDataProviderContract.getUserReservesHumanized({
      lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
      user
    })
  ]);

  // Incentive data is non-critical for health factor calculations, and the
  // on-chain UiIncentiveDataProvider can revert if any reward's price oracle
  // is dead (e.g. the deprecated stMATIC feed on Polygon after the MATIC->POL
  // migration). Degrade to "no incentives" instead of failing the market.
  let reserveIncentives: ReservesIncentiveDataHumanized[] = [];
  let userIncentives: UserReservesIncentivesDataHumanized[] = [];
  try {
    [reserveIncentives, userIncentives] = await Promise.all([
      incentiveDataProviderContract.getReservesIncentivesDataHumanized({
        lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER
      }),
      incentiveDataProviderContract.getUserReservesIncentivesDataHumanized({
        lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
        user
      })
    ]);
  } catch (err) {
    console.error(`Unable to fetch incentive data for ${market.id}, continuing without it:`, err);
  }

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
    reserveIncentives
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
    userIncentives
  });

  // Liquid eModes (Aave v3.2+): category LTV/LT + bitmaps live on the Pool.
  // Legacy UiPool/SDK only expose a single per-reserve eModeCategoryId, which
  // is 0 for most assets that participate via bitmaps — so HF/LTV from
  // formatUserSummary alone is wrong for many eMode positions.
  let eModes: EModeCategoryData[] = [];
  let reserveIds = new Map<string, number>();
  try {
    const poolAddress = await fetchPoolAddress(
      provider,
      market.addresses.LENDING_POOL_ADDRESS_PROVIDER
    );
    const underlyings = userSummary.userReservesData
      .map((r) => r.reserve.underlyingAsset)
      .filter(Boolean) as string[];
    [eModes, reserveIds] = await Promise.all([
      fetchEModeCategories(provider, poolAddress),
      fetchReserveIds(provider, poolAddress, underlyings),
    ]);
  } catch (err) {
    console.error(`Unable to fetch liquid eMode data for ${market.id}:`, err);
  }

  const hf: HealthFactorData = aaveUserSummaryToHealthFactor(
    userSummary,
    address,
    user, // if address is an ens, user will point to the resolved address.
    market,
    baseCurrencyData,
    userReserves.userEmodeCategoryId,
    eModes,
    reserveIds
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
  eModes: EModeCategoryData[] = [],
  reserveIds: Map<string, number> = new Map()
) => {
  const activeEMode = eModes.find((e) => e.id === userEmodeCategoryId);
  const userEmodeLabel = activeEMode?.label || undefined;

  const getAssetDetailsFromReserveItem = (reserveItem: ComputedUserReserve) => {
    const { reserve } = reserveItem;
    const underlying = (reserve.underlyingAsset || "").toLowerCase();
    const reserveId = reserveIds.get(underlying);
    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId,
      eModes,
      reserveId,
      baseLtv: Number(reserve.baseLTVasCollateral),
      baseLiquidationThreshold: Number(reserve.reserveLiquidationThreshold),
      legacyEModeCategoryId: Number(reserve.eModeCategoryId),
      legacyEModeLtv: Number(reserve.eModeLtv),
      legacyEModeLiquidationThreshold: Number(reserve.eModeLiquidationThreshold),
    });
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
      reserveLiquidationThreshold: Number(
        reserve.reserveLiquidationThreshold
      ),
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
      eModeLabel: reserve.eModeLabel || userEmodeLabel,
      reserveId,
      effectiveLtv: risk.ltv,
      effectiveLiquidationThreshold: risk.liquidationThreshold,
      isEModeCollateral: risk.isEMode,
      borrowableInIsolation: Boolean(reserve.borrowableInIsolation),
      isSiloedBorrowing: Boolean(reserve.isSiloedBorrowing)
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
    userEmodeLabel,
    eModes,
    isInIsolationMode: userSummary.isInIsolationMode,
  };

  const marketReferenceCurrencyPriceInUSD = new BigNumber(
    baseCurrencyData.marketReferenceCurrencyPriceInUsd
  )
    .shiftedBy(-8)
    .toNumber();

  // Recompute HF/LTV/LT with liquid eMode bitmaps. The SDK summary above still
  // uses legacy per-reserve eModeCategoryId matching, which misses most categories.
  const fetchedData = updateDerivedHealthFactorData(
    {
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
      userEmodeLabel: reserveData.userEmodeLabel,
      eModes: reserveData.eModes,
      isInIsolationMode: reserveData.isInIsolationMode,
    },
    marketReferenceCurrencyPriceInUSD
  );

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
  };
  const liquidationScenario = getCalculatedLiquidationScenario(
    hf.workingData as AaveHealthFactorData,
    marketReferenceCurrencyPriceInUSD
  );
  hf.workingData.liquidationScenario = liquidationScenario;
  return hf;
};

export default handler;
