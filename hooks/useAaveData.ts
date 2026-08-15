import { useEffect } from "react";
import { useHookstate, State } from "@hookstate/core";
import * as pools from "@aave-dao/aave-address-book";

import { ChainId } from "@aave/contract-helpers";
import BigNumber from "bignumber.js";
import { HealthFactorDataStore } from "../store/healthFactorDataStore";
import { getAaveData } from "../pages/api/aave";
import { getResolvedAddress } from "../pages/api/resolver";
import {
  EModeCategoryData,
  resolveEffectiveRiskParams,
} from "../utils/liquidEMode";

/** Max time a single market fetch (or ENS resolution) may take before it is
 * treated as failed. Keeps one hung RPC from blocking the UI forever. */
export const MARKET_FETCH_TIMEOUT_MS = 20_000;

/** Address used when ENS resolution yields no result (e.g. sandbox.eth). */
const FALLBACK_RESOLVED_ADDRESS = "0x87cCC67f0c1b67745989542152DD4acff3841CD6";

/** Reject if the promise doesn't settle within `ms`. */
export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Timed out after ${Math.round(ms / 1000)}s ${label}`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });

export type { EModeCategoryData };

export type HealthFactorData = {
  address: string; // e.g. 0xc...123a or stani.eth
  resolvedAddress: string; // e.g 0xc...123a (never ens)
  fetchError: string;
  isFetching: boolean;
  lastFetched: number;
  market: AaveMarketDataType;
  marketReferenceCurrencyPriceInUSD: number;
  availableAssets?: AssetDetails[];
  fetchedData?: AaveHealthFactorData;
  workingData?: AaveHealthFactorData;
};

export type AaveHealthFactorData = {
  address?: string;
  healthFactor: number;
  totalBorrowsUSD: number;
  availableBorrowsUSD: number;
  totalCollateralMarketReferenceCurrency: number;
  totalBorrowsMarketReferenceCurrency: number;
  currentLiquidationThreshold: number;
  currentLoanToValue: number;
  userReservesData: ReserveAssetDataItem[];
  userBorrowsData: BorrowedAssetDataItem[];
  userEmodeCategoryId?: number;
  /** Label of the user's active liquid eMode category, if any */
  userEmodeLabel?: string;
  /** All eMode categories configured on this market (liquid eModes) */
  eModes?: EModeCategoryData[];
  isInIsolationMode?: boolean;
  /** Asset prices at which the position would be liquidated (computed server-side) */
  liquidationScenario?: AssetDetails[];
};

export type ReserveAssetDataItem = {
  asset: AssetDetails;
  underlyingBalance: number;
  underlyingBalanceUSD: number;
  underlyingBalanceMarketReferenceCurrency: number;
  usageAsCollateralEnabledOnUser: boolean;
};

export type BorrowedAssetDataItem = {
  asset: AssetDetails;
  stableBorrows?: number;
  variableBorrows?: number;
  totalBorrows: number;
  totalBorrowsUSD: number;
  stableBorrowAPY: number;
  totalBorrowsMarketReferenceCurrency: number;
};

export type AssetDetails = {
  symbol: string;
  name: string;
  priceInUSD: number;
  priceInMarketReferenceCurrency: number;
  baseLTVasCollateral: number;
  isActive?: boolean;
  isFrozen?: boolean;
  isIsolated?: boolean;
  isPaused?: boolean;
  reserveLiquidationThreshold: number;
  reserveFactor: number;
  usageAsCollateralEnabled: boolean;
  initialPriceInUSD: number;
  aTokenAddress?: string;
  stableDebtTokenAddress?: string;
  variableDebtTokenAddress?: string;
  underlyingAsset?: string;
  isNewlyAddedBySimUser?: boolean;
  borrowingEnabled?: boolean;
  liquidityIndex?: number;
  variableBorrowIndex?: number;
  liquidityRate?: number;
  variableBorrowRate?: number;
  stableBorrowRate?: number;
  interestRateStrategyAddress?: number;
  availableLiquidity?: number;
  borrowCap?: number;
  supplyCap?: number;
  eModeLtv?: number;
  eModeLiquidationThreshold?: number;
  eModeLabel?: string;
  eModeCategoryId?: number;
  /** Aave reserve id used as the bit index in eMode collateral/borrowable bitmaps */
  reserveId?: number;
  /**
   * Effective LTV / LT for this asset under the current user's eMode
   * (basis points). When set, these supersede base / legacy eMode fields.
   */
  effectiveLtv?: number;
  effectiveLiquidationThreshold?: number;
  /** True when this asset is eMode collateral for the user's active category */
  isEModeCollateral?: boolean;
  borrowableInIsolation?: boolean;
  isSiloedBorrowing?: boolean;
  totalDebt?: number;
  totalStableDebt?: number;
  totalVariableDebt?: number;
  totalLiquidity?: number;
  flashLoanEnabled?: boolean;
  // Rate data (derived from base pool rates, not incentives)
  supplyAPY?: number;
  variableBorrowAPY?: number;
  stableBorrowAPY?: number;
  supplyAPR?: number;
  variableBorrowAPR?: number;
  stableBorrowAPR?: number;
};

/**
 * left to borrow = borrowCap - totalDebt
 * left to supply = supplyCap - totalLiquidity
 *
 * baseLTVasCollateral
 * reserveLiquidationThreshold
 *
 * isFrozen
 * isPaused
 * usageAsCollateralEnabled
 *
 * borrowingEnabled
 * borrowCap
 * supplyCap
 * eModeLtv
 * eModeLiquidationThreshold
 */

export type AaveMarketDataType = {
  v3?: boolean;
  id: string;
  title: string;
  chainId: ChainId;
  api: string;
  addresses: {
    LENDING_POOL_ADDRESS_PROVIDER: string;
    UI_POOL_DATA_PROVIDER: string;
  };
  explorer: string;
  explorerName: string;
  /** Earliest block that can contain Aave events for this market. Omit to scan
   * from genesis. Set it on chains whose history long predates the Aave
   * deployment, so event scans skip a range that cannot hold a match. */
  startBlock?: number;
  /** True when UI_POOL_DATA_PROVIDER is an Aave v3.7 deployment whose reserve
   * and user structs still differ from what @aave/contract-helpers decodes, so
   * these markets read through utils/uiPoolDataProviderV37. */
  v37?: boolean;
  /** Etherscan-compatible logs API (Blockscout / Routescan / Etherscan) used
   * instead of RPC eth_getLogs for interest-accrual event scans. Set it on
   * chains whose RPC caps getLogs to a block range too small to cover the
   * market's history in a reasonable number of calls (Alchemy allows only
   * 10k-block windows on Plasma and MegaETH); the explorers serve the same
   * filter over the full range in one request. */
  logApi?: string;
};

export const markets: AaveMarketDataType[] = [
  {
    v3: true,
    id: "ETHEREUM_V3",
    title: "Ethereum v3",
    chainId: ChainId.mainnet,
    api: `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Ethereum.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://etherscan.io/address/{{ADDRESS}}",
    explorerName: "Etherscan",
  },
  {
    v3: true,
    id: "ARBITRUM_V3",
    title: "Arbitrum v3",
    chainId: ChainId.arbitrum_one,
    api: `https://arb-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Arbitrum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Arbitrum.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://arbiscan.io/address/{{ADDRESS}}",
    explorerName: "Arbiscan",
  },
  {
    v3: true,
    id: "OPTIMISM_V3",
    title: "Optimism v3",
    chainId: ChainId.optimism,
    api: `https://opt-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Optimism.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Optimism.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://optimistic.etherscan.io/address/{{ADDRESS}}",
    explorerName: "Optimistic Etherscan",
  },
  {
    v3: true,
    id: "BASE_V3",
    title: "Base v3",
    chainId: ChainId.base,
    api: `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Base.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Base.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://basescan.org/address/{{ADDRESS}}",
    explorerName: "BaseScan",
  },
  {
    v3: true,
    id: "POLYGON_V3",
    title: "Polygon v3",
    chainId: ChainId.polygon,
    api: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Polygon.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Polygon.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://polygonscan.com/address/{{ADDRESS}}",
    explorerName: "PolygonScan",
  },
  {
    v3: true,
    id: "AVALANCHE_V3",
    title: "Avalanche v3",
    chainId: ChainId.avalanche,
    api: `https://avax-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Avalanche.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Avalanche.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://avascan.info/blockchain/all/address/{{ADDRESS}}",
    explorerName: "AvaScan",
  },
  /*
  {
    v3: true,
    id: "METIS_V3",
    title: "Metis v3",
    chainId: ChainId.metis_andromeda,
    api: `https://metis-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Metis.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Metis.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://andromeda-explorer.metis.io/address/{{ADDRESS}}",
    explorerName: "Metis Explorer",
  },
  */
  /*
  {
    v3: true,
    id: "GNOSIS_V3",
    title: "Gnosis v3",
    chainId: ChainId.xdai,
    api: `https://gnosis-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Gnosis.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Gnosis.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://gnosisscan.io/address/{{ADDRESS}}",
    explorerName: "Gnosis Scan",
  },
  */
  /*
  {
    v3: true,
    id: "SCROLL_V3",
    title: "Scroll v3",
    chainId: ChainId.scroll,
    api: "https://scroll-mainnet.rpc.grove.city/v1/10ccb305",
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Scroll.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Scroll.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://scrollscan.com/address/{{ADDRESS}}",
    explorerName: "Scroll Scan",
  },
  */
  {
    v3: true,
    id: "BNB_V3",
    title: "BNB Chain v3",
    chainId: ChainId.bnb,
    api: `https://bnb-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3BNB.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3BNB.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://bscscan.com/address/{{ADDRESS}}",
    explorerName: "BSC Scan",
  },
  {
    v3: true,
    id: "MONAD_V3",
    title: "Monad v3",
    // Monad (143) postdates the ChainId enum in @aave/contract-helpers 1.30.3.
    // The value only ever reaches a display id, so the cast is inert.
    chainId: 143 as ChainId,
    api: `https://monad-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Monad.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Monad.UI_POOL_DATA_PROVIDER,
    },
    // Monadscan is Etherscan-derived, so it accepts the /address/ to /tx/ swap
    // that transaction links rely on. MonadVision does not.
    explorer: "https://monadscan.com/address/{{ADDRESS}}",
    explorerName: "Monadscan",
    // Aave v3.7 launched here 2026-07-02, ~85M blocks into the chain.
    startBlock: 85_000_000,
    v37: true,
  },
  {
    v3: true,
    id: "PLASMA_V3",
    title: "Plasma v3",
    // Plasma (9745) postdates the ChainId enum in @aave/contract-helpers
    // 1.30.3. The value only ever reaches a display id, so the cast is inert.
    chainId: 9745 as ChainId,
    api: `https://plasma-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Plasma.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Plasma.UI_POOL_DATA_PROVIDER,
    },
    // Plasmascan is Routescan-based and keeps the Etherscan-style /address/
    // and /tx/ path segments that transaction links rely on.
    explorer: "https://plasmascan.to/address/{{ADDRESS}}",
    explorerName: "Plasmascan",
    // POOL_ADDRESSES_PROVIDER deployed at block 489,196 (verified on-chain).
    startBlock: 489_000,
    v37: true,
    logApi:
      "https://api.routescan.io/v2/network/mainnet/evm/9745/etherscan/api",
  },
  {
    v3: true,
    id: "MEGAETH_V3",
    title: "MegaETH v3",
    // MegaETH (4326) postdates the ChainId enum in @aave/contract-helpers
    // 1.30.3. The value only ever reaches a display id, so the cast is inert.
    chainId: 4326 as ChainId,
    api: `https://megaeth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3MegaEth.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3MegaEth.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://mega.etherscan.io/address/{{ADDRESS}}",
    explorerName: "Etherscan",
    // POOL_ADDRESSES_PROVIDER deployed at block 6,657,947 (verified on-chain).
    startBlock: 6_650_000,
    v37: true,
    logApi: "https://megaeth.blockscout.com/api",
  },
];

/** hook to fetch user aave data
 * @returns { currentAddress,
    currentMarket,
    addressData,
    addressDataStore,
    afterAssetsChanged,
    addBorrowAsset,
    addReserveAsset,
    setCurrentMarket, }
 */
export function useAaveData(address: string, preventFetch: boolean = false) {
  const store = useHookstate(HealthFactorDataStore);
  const state = store.get({ noproxy: true });
  const { currentAddress, addressData, currentMarket } = state;
  const data = addressData?.[currentAddress];
  const addressProvided: boolean = !!(address && address?.length > 0);
  if (address?.length === 0 || address === "DEBUG") {
    // eslint-disable-next-line no-param-reassign
    address = currentAddress || "";
  }

  const isLoadingAny = !!markets.find(
    (market) => data?.[market.id]?.isFetching === true,
  );

  // Number of markets that have finished (successfully or with an error).
  const loadedCount = markets.filter(
    (market) => data?.[market.id]?.lastFetched,
  ).length;

  const deps = [currentAddress, addressProvided, isLoadingAny];

  const createInitial = (market: AaveMarketDataType) => {
    const hf: HealthFactorData = {
      address,
      resolvedAddress: address, // Will be resolved when data is fetched
      fetchError: "",
      isFetching: true,
      lastFetched: 0,
      market,
      marketReferenceCurrencyPriceInUSD: 0,
    };
    store.addressData.nested(address).merge({ [market.id]: hf });
  };

  const applyFetchError = (market: AaveMarketDataType, message: string) => {
    const hfData: HealthFactorData = {
      address,
      resolvedAddress: address,
      fetchError: message,
      isFetching: false,
      lastFetched: Date.now(),
      market,
      marketReferenceCurrencyPriceInUSD: 1,
    };
    store.addressData.nested(address).merge({ [market.id]: hfData });
  };

  /** Fetch the given markets in parallel. Each market succeeds or fails
   * independently, so one bad RPC never blocks the others. */
  const fetchMarkets = (marketsToFetch: AaveMarketDataType[]) => {
    if (!marketsToFetch.length) return;
    marketsToFetch.forEach((market) => createInitial(market));

    const run = async () => {
      // Resolve ENS once for all markets instead of once per market fetch.
      let resolvedAddress: string;
      try {
        resolvedAddress =
          (await withTimeout(
            getResolvedAddress(address),
            MARKET_FETCH_TIMEOUT_MS,
            `resolving address "${address}"`,
          )) || FALLBACK_RESOLVED_ADDRESS;
      } catch (err: any) {
        const message = `Unable to resolve address "${address}": ${
          err?.message ?? err
        }`;
        console.error(message);
        marketsToFetch.forEach((market) => applyFetchError(market, message));
        return;
      }

      marketsToFetch.forEach(async (market) => {
        try {
          const hfData: HealthFactorData = await withTimeout(
            getAaveData(address, market, resolvedAddress),
            MARKET_FETCH_TIMEOUT_MS,
            `fetching ${market.title} market data`,
          );
          store.addressData.nested(address).merge({ [market.id]: hfData });
        } catch (err: any) {
          console.error(`Failed to load ${market.id} market data:`, err);
          applyFetchError(market, String(err?.message ?? err));
        }
      });
    };

    run();
  };

  useEffect(() => {
    if (preventFetch) return;
    if (!addressProvided || isLoadingAny) return;
    const marketsToFetch = markets.filter((market) => {
      const existingData = data?.[market.id];
      return !existingData?.lastFetched && !existingData?.isFetching;
    });
    fetchMarkets(marketsToFetch);
  }, deps);

  useEffect(() => {
    if (address) store.currentAddress.set(address);
  }, [address]);

  // Progressive market auto-select: as each market resolves, if the currently
  // selected market has finished loading and another loaded market has a
  // bigger position, switch to it (prefer highest collateral value). Runs on
  // every market completion so users see a market with a position as soon as
  // one is found, instead of waiting for the slowest market.
  useEffect(() => {
    if (!addressProvided || !loadedCount) return;

    const current = data?.[currentMarket];
    // Wait until the selected market itself has resolved so we don't yank the
    // UI while its skeleton is still up.
    if (!current?.lastFetched) return;

    const currentMarketHasPosition =
      current.workingData?.healthFactor &&
      (current.workingData?.healthFactor ?? -1) > -1;

    const currentMarketHasEdits =
      current.workingData?.healthFactor?.toFixed(2) !==
      current.fetchedData?.healthFactor?.toFixed(2);

    // Don't perform the auto-select if the user is actively editing the current market.
    if (currentMarketHasPosition && currentMarketHasEdits) return;

    // Only auto-select in response to fresh fetches, not e.g. on remount with
    // cached data (which would override a manual market selection).
    const didFetchRecently = !!markets.find(
      (market) => (data?.[market.id]?.lastFetched || 0) > Date.now() - 1000,
    );
    if (!didFetchRecently) return;

    const marketWithPosition = [...markets]
      .sort((marketA, marketB) => {
        const marketDataA = data?.[marketA.id];
        const marketDataB = data?.[marketB.id];

        const totalCollA =
          marketDataA?.workingData?.totalCollateralMarketReferenceCurrency || 0;
        const totalCollB =
          marketDataB?.workingData?.totalCollateralMarketReferenceCurrency || 0;

        const priceA = marketDataA?.marketReferenceCurrencyPriceInUSD || 0;
        const priceB = marketDataB?.marketReferenceCurrencyPriceInUSD || 0;

        return totalCollB * priceB - totalCollA * priceA;
      })
      .find(
        (market) =>
          data?.[market.id]?.workingData?.healthFactor &&
          (data?.[market.id]?.workingData?.healthFactor ?? -1) > -1,
      );

    if (marketWithPosition && marketWithPosition.id !== currentMarket) {
      setCurrentMarket(marketWithPosition.id);
    }
  }, [loadedCount, addressProvided]);

  /** Re-fetch a single market (e.g. after a fetch error). */
  const retryFetchMarket = (marketId: string) => {
    const market = markets.find((m) => m.id === marketId);
    if (!market || !address) return;
    if (data?.[market.id]?.isFetching) return;
    fetchMarkets([market]);
  };

  const setCurrentMarket = (marketId: string) => {
    store.currentMarket.set(marketId);
  };

  const addBorrowAsset = (symbol: string) => {
    const asset = data[currentMarket].availableAssets?.find(
      (a) => a.symbol === symbol,
    ) as AssetDetails;

    asset.isNewlyAddedBySimUser = true;

    const borrow: BorrowedAssetDataItem = {
      asset,
      totalBorrows: 0,
      totalBorrowsUSD: 0,
      totalBorrowsMarketReferenceCurrency: 0,
      stableBorrowAPY: 0,
    };

    const workingData = store.addressData.nested(address)?.[currentMarket]
      .workingData as State<AaveHealthFactorData>;

    workingData.userBorrowsData.merge([borrow]);
  };

  const addReserveAsset = (symbol: string) => {
    const asset: AssetDetails = data[currentMarket].availableAssets?.find(
      (a) => a.symbol === symbol,
    ) as AssetDetails;

    asset.isNewlyAddedBySimUser = true;

    const reserve: ReserveAssetDataItem = {
      asset,
      underlyingBalance: 0,
      underlyingBalanceUSD: 0,
      underlyingBalanceMarketReferenceCurrency: 0,
      usageAsCollateralEnabledOnUser: asset.usageAsCollateralEnabled,
    };

    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    workingData.userReservesData.merge([reserve]);
  };

  const removeAsset = (symbol: string, assetType: string) => {
    const items =
      assetType === "RESERVE"
        ? data?.[currentMarket]?.workingData?.userReservesData || []
        : data?.[currentMarket]?.workingData?.userBorrowsData || [];

    const itemIndex = items.findIndex((item) => item.asset.symbol === symbol);
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserves: State<ReserveAssetDataItem[]> =
      workingData.userReservesData;
    const borrows: State<BorrowedAssetDataItem[]> = workingData.userBorrowsData;

    assetType === "RESERVE"
      ? reserves.set((p) => {
          p.splice(itemIndex, 1);
          return p;
        })
      : borrows.set((p) => {
          p.splice(itemIndex, 1);
          return p;
        });

    updateAllDerivedHealthFactorData();
  };

  const resetCurrentMarketChanges = () => {
    store.addressData.nested(address)?.[currentMarket].workingData.set(
      JSON.parse(
        JSON.stringify(
          store.addressData[currentAddress][currentMarket].fetchedData.get({
            noproxy: true,
          }),
        ),
      ),
    );
    updateAllDerivedHealthFactorData();
  };

  const setBorrowedAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userBorrowsData.find(
      (borrowItem) => borrowItem.asset.symbol.get() === symbol,
    );
    if (item?.totalBorrows.get() !== quantity) {
      item?.totalBorrows.set(quantity);
      updateAllDerivedHealthFactorData();
    }
  };

  const setReserveAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userReservesData.find(
      (reserveItem) => reserveItem.asset.symbol.get() === symbol,
    );

    if (item?.underlyingBalance.get() !== quantity) {
      item?.underlyingBalance.set(quantity);
      updateAllDerivedHealthFactorData();
    }
  };

  const setAssetPriceInUSD = (symbol: string, price: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserveItem = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (reserveItem && reserveItem?.asset.priceInUSD.get() !== price)
      reserveItem.asset.priceInUSD.set(price);

    const borrowItem = workingData?.userBorrowsData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (borrowItem && borrowItem?.asset.priceInUSD.get() !== price)
      borrowItem.asset.priceInUSD.set(price);
    updateAllDerivedHealthFactorData();
  };

  const applyLiquidationScenario = () => {
    const liquidationScenario = getCalculatedLiquidationScenario(
      data?.[currentMarket]?.workingData as AaveHealthFactorData,
      data?.[currentMarket]?.marketReferenceCurrencyPriceInUSD,
    ) as AssetDetails[];
    liquidationScenario?.forEach((asset) =>
      setAssetPriceInUSD(asset.symbol, asset.priceInUSD),
    );
  };

  const setUseReserveAssetAsCollateral = (symbol: string, value: boolean) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserveItem = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (
      reserveItem &&
      reserveItem?.usageAsCollateralEnabledOnUser.get() !== value
    )
      reserveItem.usageAsCollateralEnabledOnUser.set(value);

    updateAllDerivedHealthFactorData();
  };

  const setCurrentAddress = (newAddress: string) => {
    store.currentAddress.set(newAddress);
  };

  const updateAllDerivedHealthFactorData = () => {
    const currentMarketReferenceCurrencyPriceInUSD: number = store.addressData
      .nested(address)
      [currentMarket].marketReferenceCurrencyPriceInUSD.get();

    const healthFactorItem = store.addressData.nested(address)?.[
      currentMarket
    ] as State<HealthFactorData>;

    const workingData = healthFactorItem.workingData.get({
      noproxy: true,
    }) as AaveHealthFactorData;

    const updatedWorkingData: AaveHealthFactorData =
      updateDerivedHealthFactorData(
        workingData,
        currentMarketReferenceCurrencyPriceInUSD,
      );

    healthFactorItem.workingData.set(updatedWorkingData);
  };

  //console.log({ data })

  return {
    isFetching: isLoadingAny,
    currentAddress,
    currentMarket,
    addressData: data,
    addressDataStore: store.addressData?.[currentAddress],
    retryFetchMarket,
    removeAsset,
    resetCurrentMarketChanges,
    addBorrowAsset,
    addReserveAsset,
    setCurrentMarket,
    setCurrentAddress,
    setBorrowedAssetQuantity,
    setReserveAssetQuantity,
    setAssetPriceInUSD,
    applyLiquidationScenario,
    setUseReserveAssetAsCollateral,
  };
}

/**
 *
 *  *** Aave-specific Utility Functions ***
 *
 */

export const getHealthFactorColor = (hf: number = 0) =>
  hf < 1.1 ? "red" : hf > 3 ? "green" : "yellow";

export const isStablecoinAsset = (asset: AssetDetails) => {
  const stablecoinSymbols = [
    // Major USD stablecoins used in Aave
    "DAI",
    "USDC",
    "USDT",
    "TUSD",
    "USDP",
    "BUSD",
    "FRAX",
    "LUSD",
    "SUSD",
    "GUSD",
    "USDD",
    "DUSD",
    // Aave-specific stablecoins
    "GHO",
    "USD",
    "EUR",
    "MAI",
    "USDE",
    "SUSDE",
    "EUSDE",
    // Euro stablecoins used in Aave
    "EURT",
    "EURS",
    "AGEUR",
    "PAR",
  ];

  return !!stablecoinSymbols.find((symbol) =>
    asset.symbol?.toUpperCase().includes(symbol),
  );
};

export const isActiveAsset = (asset: AssetDetails) =>
  asset.isActive && !asset.isPaused && !asset.isFrozen;

export const isBorrowableAsset = (asset: AssetDetails) =>
  isActiveAsset(asset) && asset.borrowingEnabled;

export const isSuppliableAsset = (asset: AssetDetails) =>
  isActiveAsset(asset) && asset.usageAsCollateralEnabled;

export const isFlashloanableAsset = (asset: AssetDetails) =>
  isActiveAsset(asset) && asset.flashLoanEnabled;

export const getEligibleLiquidationScenarioReserves = (
  hfData: AaveHealthFactorData,
) => {
  const MINIMUM_CUMULATIVE_RESERVE_USD = 50;
  const MINIMUM_CUMULATIVE_RESERVE_PCT = 5;

  // Check if there are any borrowed assets that are not stablecoins
  // If so, exclude liquidation scenario entirely
  const hasNonStablecoinBorrows = hfData.userBorrowsData.some(
    (borrowItem: BorrowedAssetDataItem) => !isStablecoinAsset(borrowItem.asset),
  );

  if (hasNonStablecoinBorrows) {
    return [];
  }

  const eligibleReserves: ReserveAssetDataItem[] =
    hfData.userReservesData.filter((reserve: ReserveAssetDataItem) => {
      const isStableCoin = isStablecoinAsset(reserve.asset);
      const isCollateralEnabled = !!reserve.usageAsCollateralEnabledOnUser;
      return !isStableCoin && isCollateralEnabled;
    }) || [];

  let cumulativeReserveUSDValue = 0;
  let cumulativeReserveMRCValue = 0;

  eligibleReserves.forEach((reserve) => {
    cumulativeReserveUSDValue += reserve.underlyingBalanceUSD;
    cumulativeReserveMRCValue +=
      reserve.underlyingBalanceMarketReferenceCurrency;
  });

  const exceedsMinResPct: boolean =
    cumulativeReserveMRCValue >
    hfData.totalCollateralMarketReferenceCurrency *
      (MINIMUM_CUMULATIVE_RESERVE_PCT / 100);
  const exceedsMinResUSD: boolean =
    cumulativeReserveUSDValue > MINIMUM_CUMULATIVE_RESERVE_USD;

  const hasSufficientValue = exceedsMinResPct && exceedsMinResUSD;

  if (!hasSufficientValue) return [];

  // in order for the non-stable reserves to be eligible for a liquidation scenario,
  // there must be at least one borrowed asset that is not included in the
  // eligible supply assets.
  const hasDifferentBorrowedAsset: boolean =
    !!hfData.userBorrowsData.length &&
    !!hfData.userBorrowsData.find(
      (borrowItem: BorrowedAssetDataItem) =>
        !eligibleReserves.find(
          (reserveItem: ReserveAssetDataItem) =>
            reserveItem.asset.symbol === borrowItem.asset.symbol,
        ),
    );

  return hasDifferentBorrowedAsset ? eligibleReserves : [];
};

/**
 * Assuming that the userReservesData or userBorrowsData has been updated in one of the following ways:
 *
 * - A userReservesData item has been added or removed
 * - A userBorrowsData item has been added or removed
 * - A userReservesData item.underlyingBalance has been modified
 * - A userReservesData item.asset.priceInUSD has been modified
 * - A userBorrowsData item.totalBorrows has been modified
 * - A userBorrowsData item.asset.priceInUSD has been modified
 *
 * This function will update all of the following derived data attributes if the value should change as a
 * result of one or more of the above item updates:
 *
 * (userReservesData) item.asset.priceInMarketReferenceCurrency (priceInUSD / marketReferenceCurrencyPriceInUSD)
 * (userReservesData) item.underlyingBalanceMarketReferenceCurrency (reserveData.priceInMarketReferenceCurrency * underlyingBalance)
 * (userReservesData) item.underlyingBalanceUSD (underlyingBalance * priceInUSD)
 * (userBorrowsData) item.totalBorrowsMarketReferenceCurrency (reserveData.priceInMarketReferenceCurrency * totalBorrows)
 * (userBorrowsData) item.totalBorrowsUSD (totalBorrows * asset.priceInUSD)
 * totalCollateralMarketReferenceCurrency
 * currentLiquidationThreshold
 * currentLoanToValue
 * healthFactor
 * availableBorrowsUSD
 *
 * @param hfData the healthFactorData to update
 * @returns hfData the updated healthFactorData
 */
export const updateDerivedHealthFactorData = (
  data: AaveHealthFactorData,
  currentMarketReferenceCurrencyPriceInUSD: number,
) => {
  let updatedCurrentLiquidationThreshold: BigNumber = new BigNumber(0);
  let updatedCurrentLoanToValue: BigNumber = new BigNumber(0);
  let updatedHealthFactor: BigNumber = new BigNumber(0);
  let updatedAvailableBorrowsUSD: BigNumber = new BigNumber(0);
  let updatedAvailableBorrowsMarketReferenceCurrency: BigNumber = new BigNumber(
    0,
  );
  let updatedTotalBorrowsUSD: BigNumber = new BigNumber(0);

  let updatedCollateral: BigNumber = new BigNumber(0);
  let weightedReservesETH: BigNumber = new BigNumber(0);
  let weightedLTVETH: BigNumber = new BigNumber(0);
  let totalBorrowsETH: BigNumber = new BigNumber(0);

  data.userReservesData.forEach((reserveItem) => {
    const underlyingBalance: BigNumber = new BigNumber(
      reserveItem.underlyingBalance,
    );
    const priceInUSD: BigNumber = new BigNumber(reserveItem.asset.priceInUSD);

    // Update reserveItem.priceInMarketReferenceCurrency
    const existingPriceInMarketReferenceCurrency = new BigNumber(
      reserveItem.asset.priceInMarketReferenceCurrency,
    );
    const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
      currentMarketReferenceCurrencyPriceInUSD,
    );
    if (
      !existingPriceInMarketReferenceCurrency.isEqualTo(
        updatedMarketReferenceCurrency,
      )
    ) {
      reserveItem.asset.priceInMarketReferenceCurrency =
        updatedMarketReferenceCurrency.toNumber();
    }

    // Update reserveItem.underlyingBalanceMarketReferenceCurrency
    const existingUnderlyingBalanceMarketReferenceCurrency: BigNumber =
      new BigNumber(reserveItem.underlyingBalanceMarketReferenceCurrency);
    const updatedUnderlyingBalanceMarketReferenceCurrency =
      updatedMarketReferenceCurrency.multipliedBy(underlyingBalance);
    if (
      !existingUnderlyingBalanceMarketReferenceCurrency.isEqualTo(
        updatedUnderlyingBalanceMarketReferenceCurrency,
      )
    ) {
      reserveItem.underlyingBalanceMarketReferenceCurrency =
        updatedUnderlyingBalanceMarketReferenceCurrency.toNumber();
    }

    // Update reserveItem.underlyingBalanceUSD
    const existingUnderlyingBalanceUSD = new BigNumber(
      reserveItem.underlyingBalanceUSD,
    );
    const updatedUnderlyingBalanceUSD =
      underlyingBalance.multipliedBy(priceInUSD);
    if (!existingUnderlyingBalanceUSD.isEqualTo(updatedUnderlyingBalanceUSD)) {
      reserveItem.underlyingBalanceUSD = updatedUnderlyingBalanceUSD.toNumber();
    }

    // Update the necessary accumulated values for updating healthFactor etc.
    if (reserveItem.usageAsCollateralEnabledOnUser) {
      updatedCollateral = updatedCollateral.plus(
        updatedUnderlyingBalanceMarketReferenceCurrency,
      );

      const risk = resolveEffectiveRiskParams({
        userEmodeCategoryId: data.userEmodeCategoryId,
        eModes: data.eModes,
        reserveId: reserveItem.asset.reserveId,
        baseLtv: reserveItem.asset.baseLTVasCollateral || 0,
        baseLiquidationThreshold:
          reserveItem.asset.reserveLiquidationThreshold || 0,
        legacyEModeCategoryId: reserveItem.asset.eModeCategoryId,
        legacyEModeLtv: reserveItem.asset.eModeLtv,
        legacyEModeLiquidationThreshold:
          reserveItem.asset.eModeLiquidationThreshold,
      });
      reserveItem.asset.effectiveLtv = risk.ltv;
      reserveItem.asset.effectiveLiquidationThreshold =
        risk.liquidationThreshold;
      reserveItem.asset.isEModeCollateral = risk.isEMode;

      const itemReserveLiquidationThreshold: BigNumber = new BigNumber(
        risk.liquidationThreshold,
      ).dividedBy(10000);
      const itemBaseLoanToValue: BigNumber = new BigNumber(risk.ltv).dividedBy(
        10000,
      );

      weightedReservesETH = weightedReservesETH.plus(
        itemReserveLiquidationThreshold.multipliedBy(
          updatedUnderlyingBalanceMarketReferenceCurrency,
        ),
      );
      weightedLTVETH = weightedLTVETH.plus(
        itemBaseLoanToValue.multipliedBy(
          updatedUnderlyingBalanceMarketReferenceCurrency,
        ),
      );
    }
  });

  data.userBorrowsData.forEach((borrowItem) => {
    const totalBorrows: BigNumber = new BigNumber(borrowItem.totalBorrows);
    const priceInUSD: BigNumber = new BigNumber(borrowItem.asset.priceInUSD);

    // Update borrowItem.priceInMarketReferenceCurrency
    const existingPriceInMarketReferenceCurrency = new BigNumber(
      borrowItem.asset.priceInMarketReferenceCurrency,
    );
    const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
      currentMarketReferenceCurrencyPriceInUSD,
    );
    if (
      !existingPriceInMarketReferenceCurrency.isEqualTo(
        updatedMarketReferenceCurrency,
      )
    ) {
      borrowItem.asset.priceInMarketReferenceCurrency =
        updatedMarketReferenceCurrency.toNumber();
    }

    // Update borrowItem.totalBorrowsMarketReferenceCurrency
    const existingTotalBorrowsMarketReferenceCurrency: BigNumber =
      new BigNumber(borrowItem.totalBorrowsMarketReferenceCurrency);
    const updatedTotalBorrowsMarketReferenceCurrency =
      updatedMarketReferenceCurrency.multipliedBy(totalBorrows);
    if (
      !existingTotalBorrowsMarketReferenceCurrency.isEqualTo(
        updatedTotalBorrowsMarketReferenceCurrency,
      )
    ) {
      borrowItem.totalBorrowsMarketReferenceCurrency =
        updatedTotalBorrowsMarketReferenceCurrency.toNumber();
    }

    // Update borrowItem.totalBorrowsUSD
    const existingTotalBorrowsUSD = new BigNumber(borrowItem.totalBorrowsUSD);
    const itemTotalBorrowsUSD = totalBorrows.multipliedBy(priceInUSD);
    if (!existingTotalBorrowsUSD.isEqualTo(itemTotalBorrowsUSD)) {
      borrowItem.totalBorrowsUSD = itemTotalBorrowsUSD.toNumber();
    }

    // Update the necessary accumulated values for updating healthFactor etc.
    totalBorrowsETH = totalBorrowsETH.plus(
      updatedTotalBorrowsMarketReferenceCurrency,
    );
  });

  // Update "totalCollateralMarketReferenceCurrency"
  if (
    !updatedCollateral.isEqualTo(
      new BigNumber(data.totalCollateralMarketReferenceCurrency),
    )
  ) {
    data.totalCollateralMarketReferenceCurrency = updatedCollateral.toNumber();
  }

  // Update "totalBorrowsMarketReferenceCurrency"
  if (
    !totalBorrowsETH.isEqualTo(
      new BigNumber(data.totalBorrowsMarketReferenceCurrency),
    )
  ) {
    data.totalBorrowsMarketReferenceCurrency = totalBorrowsETH.toNumber();
  }

  // Updated "currentLiquidationThreshold"
  if (
    weightedReservesETH.isGreaterThan(0) &&
    updatedCollateral.isGreaterThan(0)
  ) {
    updatedCurrentLiquidationThreshold =
      weightedReservesETH.dividedBy(updatedCollateral);
  }

  if (
    !updatedCurrentLiquidationThreshold.isEqualTo(
      new BigNumber(data.currentLiquidationThreshold),
    )
  ) {
    data.currentLiquidationThreshold =
      updatedCurrentLiquidationThreshold.toNumber();
  }

  // Update "currentLoanToValue"
  if (weightedLTVETH.isGreaterThan(0) && updatedCollateral.isGreaterThan(0)) {
    updatedCurrentLoanToValue = weightedLTVETH.dividedBy(updatedCollateral);
  }
  if (
    !updatedCurrentLoanToValue.isEqualTo(new BigNumber(data.currentLoanToValue))
  ) {
    data.currentLoanToValue = updatedCurrentLoanToValue.toNumber();
  }

  // Update "healthFactor"
  if (
    updatedCollateral.isGreaterThan(0) &&
    totalBorrowsETH.isGreaterThan(0) &&
    updatedCurrentLiquidationThreshold.isGreaterThan(0)
  ) {
    updatedHealthFactor = updatedCollateral
      .multipliedBy(updatedCurrentLiquidationThreshold)
      .dividedBy(totalBorrowsETH);
  } else if (totalBorrowsETH.isEqualTo(0)) {
    updatedHealthFactor = new BigNumber(Infinity);
  }

  if (!updatedHealthFactor.isEqualTo(new BigNumber(data.healthFactor))) {
    data.healthFactor = updatedHealthFactor.toNumber();
  }

  // Update "availableBorrowsUSD"
  updatedAvailableBorrowsMarketReferenceCurrency = updatedCollateral
    .multipliedBy(updatedCurrentLoanToValue)
    .minus(totalBorrowsETH);
  updatedAvailableBorrowsUSD =
    updatedAvailableBorrowsMarketReferenceCurrency.multipliedBy(
      currentMarketReferenceCurrencyPriceInUSD,
    );

  if (updatedAvailableBorrowsUSD.isLessThan(0))
    updatedAvailableBorrowsUSD = new BigNumber(0);

  if (
    !updatedAvailableBorrowsUSD.isEqualTo(
      new BigNumber(data.availableBorrowsUSD),
    )
  ) {
    data.availableBorrowsUSD = updatedAvailableBorrowsUSD.toNumber();
  }

  // Update "totalBorrowsUSD"
  updatedTotalBorrowsUSD = totalBorrowsETH.multipliedBy(
    currentMarketReferenceCurrencyPriceInUSD,
  );

  if (!updatedTotalBorrowsUSD.isEqualTo(new BigNumber(data.totalBorrowsUSD))) {
    data.totalBorrowsUSD = updatedTotalBorrowsUSD.toNumber();
  }

  return data;
};

/**
 *
 * @param hfData AaveHealthFactorData
 * @param currentMarketReferenceCurrencyPriceInUSD number
 * @returns AssetDetails[]
 *
 * Given a working position, return assets with updated priceInUSD that when applied would result in an hf ~1.00
 *
 */
export const getCalculatedLiquidationScenario = (
  hfData: AaveHealthFactorData,
  currentMarketReferenceCurrencyPriceInUSD: number,
) => {
  if (!hfData) return [];
  // deep clone to avoid mutating state
  // eslint-disable-next-line no-param-reassign
  hfData = JSON.parse(JSON.stringify(hfData)) as AaveHealthFactorData;

  const reserves: ReserveAssetDataItem[] =
    getEligibleLiquidationScenarioReserves(hfData);

  let assets: AssetDetails[] = reserves.map(
    (res: ReserveAssetDataItem) => res.asset,
  );

  let hf: number = hfData?.healthFactor || -1;

  const HF_LIMIT: number = 1.0049999999999;

  if (!assets.length || hf === Infinity || hf === -1) return [];

  // If the rounded hf === 1.00, just use the current asset prices since they represent a valid liquidation scenario.
  if (Math.round((hf + Number.EPSILON) * 100) / 100 === 1.0) {
    return assets;
  }

  // We're going to somewhat naively (and inefficiently) loop while we iteratively manipulate the asset
  // price until we get a HF that approaches ~1.00. While there is definitely more efficient
  // means of calculating the asset prices that would result in a hf of ~1.00, handling all the edge
  // cases with that approach proved rather elusive.

  let i = 0;

  // I don't expect this limit to get approached, but just in case things go haywire, don't let the app crash.
  const SHORT_CIRCUIT_LOOP_LIMIT = 500;

  // First, if we're below the HF_LIMIT, iteratively increase the price until hf > HF_LIMIT
  while (hf < HF_LIMIT && i < SHORT_CIRCUIT_LOOP_LIMIT) {
    i += 1;

    // The closure intentionally reads/writes the loop-carried `hf` accumulator.
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    assets.forEach((asset) => {
      let priceIncrement = (asset.priceInUSD || 1) * 0.1;

      priceIncrement =
        Math.round((priceIncrement + Number.EPSILON) * 100) / 100;

      asset.priceInUSD += priceIncrement;

      const reserveItemAsset = hfData.userReservesData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (reserveItemAsset)
        reserveItemAsset.asset.priceInUSD = asset.priceInUSD;

      const borrowItemAsset = hfData.userBorrowsData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (borrowItemAsset) borrowItemAsset.asset.priceInUSD = asset.priceInUSD;

      const updatedWorkingData = updateDerivedHealthFactorData(
        hfData,
        currentMarketReferenceCurrencyPriceInUSD,
      );

      hf = updatedWorkingData.healthFactor;
    });
  }

  let shortCircuit = false;

  // Next, uniformly decrement the asset prices until we approach the liquidation threshold.
  while (hf > HF_LIMIT && i < SHORT_CIRCUIT_LOOP_LIMIT && !shortCircuit) {
    i += 1;

    // Track a uniform percentage to decrement asset prices, so that the overall decrement percentage
    // for all assets will be approximately the same.
    let decrementPercentage = 0;

    // The closure intentionally reads/writes the loop-carried accumulators.
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    assets.forEach((asset) => {
      if (hf < HF_LIMIT) return;

      const initialPrice = asset.priceInUSD;

      let priceDecrement = decrementPercentage
        ? // Use the uniform percentage, if we  have it
          Math.max(0.01, (decrementPercentage * asset.priceInUSD) / 100)
        : // Else use an approximation based on the difference between current hf and HF_LIMIT
          Math.max(
            0.01,
            Math.min(
              asset.priceInUSD * ((hf - HF_LIMIT) * 0.45),
              asset.priceInUSD * 0.5,
            ),
          );

      priceDecrement =
        Math.round((priceDecrement + Number.EPSILON) * 100) / 100;

      if (!decrementPercentage) {
        decrementPercentage = (priceDecrement * 100) / asset.priceInUSD;
      }

      asset.priceInUSD = Math.max(asset.priceInUSD - priceDecrement, 0.01);

      // If all asset prices needs to go below one cent in order to arrive at liquidation threshold,
      // short circuit the operation and assume there is no viable price liquidation scenario for this
      // position.
      if (asset.priceInUSD === 0.01) {
        if (!assets.find((other) => other.priceInUSD > 0.01)) {
          shortCircuit = true;
        }
      }

      const reserveItemAsset = hfData.userReservesData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (reserveItemAsset)
        reserveItemAsset.asset.priceInUSD = asset.priceInUSD;

      const borrowItemAsset = hfData.userBorrowsData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (borrowItemAsset) borrowItemAsset.asset.priceInUSD = asset.priceInUSD;

      const updatedWorkingData = updateDerivedHealthFactorData(
        hfData,
        currentMarketReferenceCurrencyPriceInUSD,
      );

      if (updatedWorkingData.healthFactor < 1.0) {
        asset.priceInUSD = initialPrice;
        return;
      }

      hf = updatedWorkingData.healthFactor;
    });
  }

  if (shortCircuit || i === SHORT_CIRCUIT_LOOP_LIMIT) assets = [];

  return assets;
};

export const getIconNameFromAssetSymbol = (assetSymbol: string) => {
  if (!assetSymbol) return "";

  let iconName = assetSymbol.toLowerCase();

  // Handle special PT (Principal Token) cases
  if (iconName.includes("pt-")) {
    // Extract the base token from PT tokens
    // e.g., "PT-eUSDE-14AUG2025" -> "eusde"
    // e.g., "PT-sUSDE-25SEP2025" -> "susde"
    // e.g., "PT-USDe-31JUL2025" -> "usde"
    const ptMatch = iconName.match(/pt-(.+?)-/);
    if (ptMatch) {
      [, iconName] = ptMatch;
    }
  }

  // Handle Ethereal/Ethena tokens
  if (iconName.includes("ethereal") || iconName.includes("ethena")) {
    // Extract the base token from the long name
    // e.g., "PT Ethereal eUSDE 14AUG2025" -> "eusde"
    // e.g., "PT Ethena sUSDE 25SEP2025" -> "susde"
    const etherealMatch = iconName.match(/(eusde|susde|usde)/);
    if (etherealMatch) {
      [, iconName] = etherealMatch;
    }
  }

  // Apply standard transformations
  iconName = iconName
    .replace(".e", "")
    .replace(".b", "")
    .replace("m.", "")
    .replace("btcb", "btc");

  return iconName;
};

export const getIconNameFromMarket = (market?: AaveMarketDataType) =>
  market?.id
    ?.split("_")[0]
    .replace("BNB", "binance") // special case... follow aave interface convention
    .toLowerCase() || "";
