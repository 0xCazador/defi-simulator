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
  fetchEModeCategory,
  fetchPoolAddress,
  fetchReserveIds,
  resolveEffectiveRiskParams,
} from "../../../utils/liquidEMode";
import {
  V37Context,
  getReservesHumanizedV37,
  getUserReservesHumanizedV37,
} from "../../../utils/uiPoolDataProviderV37";
import { getV4MarketData } from "../../../utils/spokeDataProviderV4";
import {
  isMeaningfulFetchedBorrow,
  isMeaningfulFetchedSupply,
} from "../../../utils/minPositionUsd";

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
      (m: AaveMarketDataType) => m.id === marketId,
    ) as AaveMarketDataType;
    const data: HealthFactorData = await getAaveData(address, market);
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

/**
 * The user's active eMode category, as the single-element list the risk
 * resolver expects. eMode data is an accuracy refinement, so a failure here
 * degrades to base LTV/LT rather than failing the whole market fetch.
 */
const fetchEModeCategoryForUser = (
  provider: ethers.providers.Provider,
  poolAddressPromise: Promise<string>,
  userEmodeCategoryId: number,
  marketId: string,
): Promise<EModeCategoryData[]> =>
  poolAddressPromise
    .then((poolAddress) =>
      fetchEModeCategory(provider, poolAddress, userEmodeCategoryId),
    )
    .then((category) => (category ? [category] : []))
    .catch((err) => {
      console.error(`Unable to fetch liquid eMode data for ${marketId}:`, err);
      return [];
    });

export const getAaveData = async (
  address: string,
  market: AaveMarketDataType,
  resolvedAddress?: string,
) => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId,
  );

  // Aave v4 (Hub & Spoke) has no UiPoolDataProvider, eModes or isolation
  // mode; its fetch/decode path is entirely different, so branch early.
  if (market.v4) {
    const user =
      resolvedAddress ||
      (await getResolvedAddress(address)) ||
      "0x87cCC67f0c1b67745989542152DD4acff3841CD6";
    return getAaveDataV4(address, user, market, provider);
  }

  // The V3 pool addresses are present on every non-v4 market.
  const addresses = market.addresses!;

  const UiPoolDataCtx: UiPoolDataProviderContext = {
    uiPoolDataProviderAddress: addresses.UI_POOL_DATA_PROVIDER,
    provider,
    chainId: market.chainId,
  };
  const poolDataProviderContract = new UiPoolDataProvider(UiPoolDataCtx);

  const poolAddressPromise = fetchPoolAddress(
    provider,
    addresses.LENDING_POOL_ADDRESS_PROVIDER,
  );

  // Callers that fetch multiple markets resolve ENS once and pass the result
  // in; fall back to resolving here for single-market callers (API routes).
  const user =
    resolvedAddress ||
    (await getResolvedAddress(address)) ||
    "0x87cCC67f0c1b67745989542152DD4acff3841CD6";

  const v37Ctx: V37Context = {
    provider,
    uiPoolDataProviderAddress: addresses.UI_POOL_DATA_PROVIDER,
    lendingPoolAddressProvider: addresses.LENDING_POOL_ADDRESS_PROVIDER,
    chainId: market.chainId,
  };

  const [reserves, userReserves] = await Promise.all([
    market.v37
      ? getReservesHumanizedV37(v37Ctx)
      : poolDataProviderContract.getReservesHumanized({
          lendingPoolAddressProvider: addresses.LENDING_POOL_ADDRESS_PROVIDER,
        }),
    market.v37
      ? getUserReservesHumanizedV37(v37Ctx, user)
      : poolDataProviderContract.getUserReservesHumanized({
          lendingPoolAddressProvider: addresses.LENDING_POOL_ADDRESS_PROVIDER,
          user,
        }),
  ]);

  const reservesArray = reserves.reservesData;
  const { baseCurrencyData } = reserves;
  const userReservesArray = userReserves.userReserves;

  // Liquid eModes (Aave v3.2+): category LTV/LT + bitmaps live on the Pool.
  // Legacy UiPool/SDK only expose a single per-reserve eModeCategoryId, which
  // is 0 for most assets that participate via bitmaps — so HF/LTV from
  // formatUserSummary alone is wrong for many eMode positions.
  //
  // Only the user's active category can affect their risk params, so fetch
  // that one rather than enumerating the pool's whole set. Users not in an
  // eMode — including every market where the address holds nothing — need no
  // eMode calls at all. This has to wait on userReserves to know the id,
  // which costs one extra round-trip for eMode users and saves ~40 RPC calls
  // per market for everyone else.
  const eModesPromise: Promise<EModeCategoryData[]> =
    userReserves.userEmodeCategoryId
      ? fetchEModeCategoryForUser(
          provider,
          poolAddressPromise,
          userReserves.userEmodeCategoryId,
          market.id,
        )
      : Promise.resolve([]);

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
        fetchReserveIds(provider, poolAddress, underlyings),
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
    reserveIds,
  );
  return hf;
};

/**
 * Aave v4 market fetch: reserves, prices and user amounts come from the
 * Spoke/Hub adapter, then flow through the same formatReserves /
 * formatUserSummary pipeline as v3. There are no eModes (correlated-asset
 * Spokes replace them) and no isolation mode, so those inputs stay empty.
 */
const getAaveDataV4 = async (
  address: string,
  user: string,
  market: AaveMarketDataType,
  provider: ethers.providers.Provider,
) => {
  const { SPOKE, ORACLE } = market.v4Addresses!;
  const {
    reservesData,
    baseCurrencyData,
    userReserves,
    userEmodeCategoryId,
    reserveIds,
  } = await getV4MarketData(
    {
      provider,
      spokeAddress: SPOKE,
      oracleAddress: ORACLE,
      chainId: market.chainId,
    },
    user,
  );

  const currentTimestamp = dayjs().unix();

  const formattedPoolReserves = formatReserves({
    reserves: reservesData,
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
    userReserves,
    formattedReserves: formattedPoolReserves,
    userEmodeCategoryId,
  });

  const hf: HealthFactorData = aaveUserSummaryToHealthFactor(
    userSummary,
    address,
    user,
    market,
    baseCurrencyData,
    userEmodeCategoryId,
    [],
    reserveIds,
  );
  return hf;
};

/** One asset's public risk parameters and rates — no user involved. */
export type MarketReserveStat = {
  symbol: string;
  /** fraction, e.g. 0.8 for an 80% max LTV */
  ltv: number;
  /** fraction, e.g. 0.825 */
  liquidationThreshold: number;
  /** the liquidator's bonus as a fraction, e.g. 0.05 for a 5% penalty */
  liquidationPenalty: number;
  /** fraction, e.g. 0.0432 for 4.32% */
  supplyAPY: number;
  variableBorrowAPY: number;
  /** used only for ranking assets by size */
  totalLiquidityUSD: number;
  borrowingEnabled: boolean;
  usageAsCollateralEnabled: boolean;
};

/**
 * RPC endpoint for server-side reads.
 *
 * NEXT_PUBLIC_ALCHEMY_API_KEY is origin-locked: Alchemy answers requests that
 * arrive without an allowlisted Referer with `403 Unspecified origin not on
 * whitelist`. That is the right posture for a key shipped to browsers — and
 * the app does fetch positions from the browser — but it means anything
 * running at build or revalidate time needs its own unrestricted key.
 *
 * Set ALCHEMY_SERVER_API_KEY (no NEXT_PUBLIC prefix, so it stays server-side)
 * to enable those fetches. Without it the reserve snapshot is unavailable and
 * the pages render their copy without the parameter tables.
 */
const serverRpcUrl = (market: AaveMarketDataType): string => {
  const serverKey = process.env.ALCHEMY_SERVER_API_KEY;
  const publicKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  if (!serverKey || !publicKey || !market.api.includes(publicKey)) {
    return market.api;
  }
  return market.api.replace(publicKey, serverKey);
};

/**
 * Public reserve parameters for one market, with no address in the picture.
 *
 * getAaveData needs a user: it resolves ENS, pulls user reserves, runs
 * formatUserSummary and fetches E-Mode categories and reserve ids. None of
 * that applies to the reserve catalog rendered on the marketing sections, and
 * skipping it drops this to a single RPC round trip per v3 market.
 */
export const getMarketReserveStats = async (
  market: AaveMarketDataType,
): Promise<MarketReserveStat[]> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    serverRpcUrl(market),
    market.chainId,
  );
  const currentTimestamp = dayjs().unix();

  let reservesArray;
  let baseCurrencyData;

  if (market.v4) {
    // The v4 adapter always reads a user's amounts alongside the reserves;
    // the zero address just makes every user field zero.
    const { SPOKE, ORACLE } = market.v4Addresses!;
    const v4Data = await getV4MarketData(
      {
        provider,
        spokeAddress: SPOKE,
        oracleAddress: ORACLE,
        chainId: market.chainId,
      },
      ethers.constants.AddressZero,
    );
    reservesArray = v4Data.reservesData;
    baseCurrencyData = v4Data.baseCurrencyData;
  } else {
    const addresses = market.addresses!;
    const v37Ctx: V37Context = {
      provider,
      uiPoolDataProviderAddress: addresses.UI_POOL_DATA_PROVIDER,
      lendingPoolAddressProvider: addresses.LENDING_POOL_ADDRESS_PROVIDER,
      chainId: market.chainId,
    };
    const reserves = market.v37
      ? await getReservesHumanizedV37(v37Ctx)
      : await new UiPoolDataProvider({
          uiPoolDataProviderAddress: addresses.UI_POOL_DATA_PROVIDER,
          provider,
          chainId: market.chainId,
        }).getReservesHumanized({
          lendingPoolAddressProvider: addresses.LENDING_POOL_ADDRESS_PROVIDER,
        });
    reservesArray = reserves.reservesData;
    baseCurrencyData = reserves.baseCurrencyData;
  }

  const formatted = formatReserves({
    reserves: reservesArray,
    currentTimestamp,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
  });

  return formatted
    .filter((reserve) => reserve.isActive && !reserve.isFrozen)
    .map((reserve) => ({
      symbol: reserve.symbol,
      ltv: Number(reserve.formattedBaseLTVasCollateral),
      liquidationThreshold: Number(
        reserve.formattedReserveLiquidationThreshold,
      ),
      liquidationPenalty: Number(reserve.formattedReserveLiquidationBonus),
      supplyAPY: Number(reserve.supplyAPY),
      variableBorrowAPY: Number(reserve.variableBorrowAPY),
      totalLiquidityUSD: Number(reserve.totalLiquidityUSD),
      borrowingEnabled: Boolean(reserve.borrowingEnabled),
      usageAsCollateralEnabled: Boolean(reserve.usageAsCollateralEnabled),
    }));
};

/** Reserve shape as it exists at runtime: the humanized on-chain reserve
 * fields are preserved through formatReserves/formatUserSummary. */
type ReserveData = FormatReserveUSDResponse &
  ReserveDataHumanized & {
    eModeCategoryId?: number;
    eModeLtv?: number;
    eModeLiquidationThreshold?: number;
    eModeLabel?: string;
    stableDebtTokenAddress?: string;
    stableBorrowAPY?: string | number;
    stableBorrowAPR?: string | number;
  };

const aaveUserSummaryToHealthFactor = (
  userSummary: FormatUserSummaryResponse<ReserveData>,
  address: string,
  resolvedAddress: string,
  market: AaveMarketDataType,
  baseCurrencyData: any,
  userEmodeCategoryId: number,
  eModes: EModeCategoryData[] = [],
  reserveIds: Map<string, number> = new Map(),
) => {
  const activeEMode = eModes.find((e) => e.id === userEmodeCategoryId);
  const userEmodeLabel = activeEMode?.label || undefined;

  const getAssetDetailsFromReserveItem = (
    reserveItem: ComputedUserReserve<ReserveData>,
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
      legacyEModeCategoryId: Number(reserve.eModeCategoryId ?? 0),
      legacyEModeLtv: Number(reserve.eModeLtv ?? 0),
      legacyEModeLiquidationThreshold: Number(
        reserve.eModeLiquidationThreshold ?? 0,
      ),
    });
    const details: AssetDetails = {
      symbol: reserve.symbol,
      name: reserve.name,
      priceInUSD: Number(reserve.priceInUSD),
      priceInMarketReferenceCurrency: new BigNumber(
        reserve.priceInMarketReferenceCurrency,
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
      stableBorrowAPY: Number(reserve.stableBorrowAPY ?? 0),
      supplyAPR: Number(reserve.supplyAPR),
      variableBorrowAPR: Number(reserve.variableBorrowAPR),
      stableBorrowAPR: Number(reserve.stableBorrowAPR ?? 0),
      availableLiquidity: Number(reserve.availableLiquidity),
      borrowCap: Number(reserve.borrowCap),
      supplyCap: Number(reserve.supplyCap),
      eModeLtv: Number(reserve.eModeLtv ?? 0),
      eModeLiquidationThreshold: Number(reserve.eModeLiquidationThreshold ?? 0),
      eModeCategoryId: Number(reserve.eModeCategoryId ?? 0),
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
      userSummary?.totalCollateralMarketReferenceCurrency,
    ),
    totalBorrowsMarketReferenceCurrency: Number(
      userSummary?.totalBorrowsMarketReferenceCurrency,
    ),
    currentLiquidationThreshold: Number(
      userSummary?.currentLiquidationThreshold,
    ),
    currentLoanToValue: Number(userSummary?.currentLoanToValue),
    // Dust under $1 is dropped here so every consumer (UI, HF, interest,
    // share cards) sees the same position set. Simulated edits are not filtered.
    userReservesData: userSummary?.userReservesData
      ?.filter(isMeaningfulFetchedSupply)
      .map((reserveItem) => {
        const item: ReserveAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          underlyingBalance: Number(reserveItem.underlyingBalance),
          underlyingBalanceUSD: Number(reserveItem.underlyingBalanceUSD),
          underlyingBalanceMarketReferenceCurrency: Number(
            reserveItem.underlyingBalanceMarketReferenceCurrency,
          ),
          usageAsCollateralEnabledOnUser:
            reserveItem.usageAsCollateralEnabledOnUser,
        };
        return item;
      }),
    userBorrowsData: userSummary?.userReservesData
      ?.filter(isMeaningfulFetchedBorrow)
      .map((reserveItem) => {
        const item: BorrowedAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          stableBorrows: 0,
          variableBorrows: Number(reserveItem.variableBorrows),
          totalBorrowsUSD: Number(reserveItem.totalBorrowsUSD),
          totalBorrows: Number(reserveItem.totalBorrows),
          stableBorrowAPY: 0,
          totalBorrowsMarketReferenceCurrency: Number(
            reserveItem.totalBorrowsMarketReferenceCurrency,
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
    baseCurrencyData.marketReferenceCurrencyPriceInUsd,
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
    marketReferenceCurrencyPriceInUSD,
  );

  // formatUserSummary reports healthFactor as -1 when the user has no debt,
  // but the recompute above turns that into Infinity — which JSON-serializes
  // to null, and `null > -1` is true, so every empty wallet looked like an
  // open position on the client. Restore the SDK sentinel when there's no debt.
  if (!(fetchedData.totalBorrowsMarketReferenceCurrency > 0)) {
    fetchedData.healthFactor = reserveData.healthFactor;
  }

  const workingData: AaveHealthFactorData = JSON.parse(
    JSON.stringify(fetchedData),
  );
  workingData.liquidationScenario = getCalculatedLiquidationScenario(
    workingData,
    marketReferenceCurrencyPriceInUSD,
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
      getAssetDetailsFromReserveItem(asset),
    ),
    fetchedData,
    workingData,
  };
  return hf;
};

export default handler;
