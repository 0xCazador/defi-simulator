import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  ReserveDataHumanized,
  UiPoolDataProvider,
  UiPoolDataProviderContext,
} from "@aave/contract-helpers";
import dayjs from "dayjs";
import {
  ComputedUserReserve,
  FormatReserveUSDResponse,
  FormatUserSummaryResponse,
  formatReserves,
  formatUserSummary,
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
import {
  V37Context,
  getReservesHumanizedV37,
  getUserReservesHumanizedV37,
} from "../../../utils/uiPoolDataProviderV37";

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      res.status(405).send({ message: "Method not allowed." });
      return;
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

export const getAaveData = async (
  address: string,
  market: AaveMarketDataType,
  resolvedAddress?: string
) => {
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

  // Liquid eModes (Aave v3.2+): category LTV/LT + bitmaps live on the Pool.
  // Legacy UiPool/SDK only expose a single per-reserve eModeCategoryId, which
  // is 0 for most assets that participate via bitmaps — so HF/LTV from
  // formatUserSummary alone is wrong for many eMode positions.
  // These don't depend on the user or reserve data, so start them immediately
  // and let them run concurrently with the main reserve queries below.
  const poolAddressPromise = fetchPoolAddress(
    provider,
    market.addresses.LENDING_POOL_ADDRESS_PROVIDER
  );
  const eModesPromise: Promise<EModeCategoryData[]> = poolAddressPromise
    .then((poolAddress) => fetchEModeCategories(provider, poolAddress))
    .catch((err) => {
      console.error(`Unable to fetch liquid eMode data for ${market.id}:`, err);
      return [];
    });

  // Callers that fetch multiple markets resolve ENS once and pass the result
  // in; fall back to resolving here for single-market callers (API routes).
  const user =
    resolvedAddress ||
    (await getResolvedAddress(address)) ||
    "0x87cCC67f0c1b67745989542152DD4acff3841CD6";

  const v37Ctx: V37Context = {
    provider,
    uiPoolDataProviderAddress: market.addresses.UI_POOL_DATA_PROVIDER,
    lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
    chainId: market.chainId,
  };

  const [reserves, userReserves] = await Promise.all([
    market.v37
      ? getReservesHumanizedV37(v37Ctx)
      : poolDataProviderContract.getReservesHumanized({
          lendingPoolAddressProvider:
            market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
        }),
    market.v37
      ? getUserReservesHumanizedV37(v37Ctx, user)
      : poolDataProviderContract.getUserReservesHumanized({
          lendingPoolAddressProvider:
            market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
          user,
        }),
  ]);

  const reservesArray = reserves.reservesData;
  const { baseCurrencyData } = reserves;
  const userReservesArray = userReserves.userReserves;

  const currentTimestamp = dayjs().unix();

  const formattedPoolReserves = formatReserves({
    reserves: reservesArray,
    currentTimestamp,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
  });

  const userSummary = formatUserSummary({
    currentTimestamp,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    userReserves: userReservesArray,
    formattedReserves: formattedPoolReserves,
    userEmodeCategoryId: userReserves.userEmodeCategoryId,
  });

  const underlyings = userSummary.userReservesData
    .map((r) => r.reserve.underlyingAsset)
    .filter(Boolean) as string[];
  const [eModes, reserveIds] = await Promise.all([
    eModesPromise,
    poolAddressPromise
      .then((poolAddress) =>
        fetchReserveIds(provider, poolAddress, underlyings)
      )
      .catch((err) => {
        console.error(`Unable to fetch reserve ids for ${market.id}:`, err);
        return new Map<string, number>();
      }),
  ]);

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

/** Reserve shape as it exists at runtime: the humanized on-chain reserve
 * fields are preserved through formatReserves/formatUserSummary. */
type ReserveData = FormatReserveUSDResponse & ReserveDataHumanized;

const aaveUserSummaryToHealthFactor = (
  userSummary: FormatUserSummaryResponse<ReserveData>,
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

  const getAssetDetailsFromReserveItem = (
    reserveItem: ComputedUserReserve<ReserveData>
  ) => {
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
      legacyEModeLiquidationThreshold: Number(
        reserve.eModeLiquidationThreshold
      ),
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
      eModeLabel: reserve.eModeLabel || userEmodeLabel,
      reserveId,
      effectiveLtv: risk.ltv,
      effectiveLiquidationThreshold: risk.liquidationThreshold,
      isEModeCollateral: risk.isEMode,
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
        (reserveItem) =>
          reserveItem?.underlyingBalance &&
          reserveItem.underlyingBalance !== "0"
      )
      .map((reserveItem) => {
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
        (reserveItem) =>
          reserveItem?.totalBorrows && reserveItem.totalBorrows !== "0"
      )
      .map((reserveItem) => {
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

  // formatUserSummary reports healthFactor as -1 when the user has no debt,
  // but the recompute above turns that into Infinity — which JSON-serializes
  // to null, and `null > -1` is true, so every empty wallet looked like an
  // open position on the client. Restore the SDK sentinel when there's no debt.
  if (!(fetchedData.totalBorrowsMarketReferenceCurrency > 0)) {
    fetchedData.healthFactor = reserveData.healthFactor;
  }

  const workingData: AaveHealthFactorData = JSON.parse(
    JSON.stringify(fetchedData)
  );
  workingData.liquidationScenario = getCalculatedLiquidationScenario(
    workingData,
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
    workingData,
  };
  return hf;
};

export default handler;
