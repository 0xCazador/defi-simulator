import { useEffect, useRef, useState } from "react";
import { useHookstate, State } from "@hookstate/core";
import * as pools from "@bgd-labs/aave-address-book";

import { HealthFactorDataStore } from "../store/healthFactorDataStore";

import { ChainId } from "@aave/contract-helpers";
import BigNumber from "bignumber.js";
import { getAaveData } from "../pages/api/aave";
import {
  EModeCategoryData,
  resolveEffectiveRiskParams,
} from "../utils/liquidEMode";
import {
  AssetRiskOverride,
  EModeCategoryOverride,
  RiskParamOverrides,
  SharedRiskConfig,
  applyEModeCategoryOverrides,
  createEmptyRiskOverrides,
  hasAnyRiskOverrides,
  mergeRiskOverrides,
  sanitizeRiskOverrides,
} from "../utils/riskOverrides";

export type { EModeCategoryData };
export type { RiskParamOverrides, SharedRiskConfig };

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
}

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
  flashLoanEnabled?: boolean
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
      UI_POOL_DATA_PROVIDER: "0x194324C9Af7f56E22F1614dD82E18621cb9238E7",
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
      UI_POOL_DATA_PROVIDER: "0xc0179321f0825c3e0F59Fe7Ca4E40557b97797a3", // pools.AaveV3Arbitrum.UI_POOL_DATA_PROVIDER,
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
      UI_POOL_DATA_PROVIDER: "0x86b0521f92a554057e54B93098BA2A6Aaa2F4ACB", // pools.AaveV3Optimism.UI_POOL_DATA_PROVIDER,
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
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Base.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4", // pools.AaveV3Base.UI_POOL_DATA_PROVIDER,
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
      UI_POOL_DATA_PROVIDER: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4", // pools.AaveV3Polygon.UI_POOL_DATA_PROVIDER,
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
      UI_POOL_DATA_PROVIDER: "0x374a2592f0265b3bb802d75809e61b1b5BbD85B7", // pools.AaveV3Avalanche.UI_POOL_DATA_PROVIDER,
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
      UI_POOL_DATA_PROVIDER: "0x5d4D4007A4c6336550DdAa2a7c0d5e7972eebd16", // pools.AaveV3Metis.UI_POOL_DATA_PROVIDER,
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
      UI_POOL_DATA_PROVIDER: "0xb12e82DF057BF16ecFa89D7D089dc7E5C1Dc057B", // pools.AaveV3BNB.UI_POOL_DATA_PROVIDER,
    },
    explorer: "https://bscscan.com/address/{{ADDRESS}}",
    explorerName: "BSC Scan",
  }
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
  const [isFetching, setIsFetching] = useState(false);
  const store = useHookstate(HealthFactorDataStore);
  const state = store.get({ noproxy: true });
  const { currentAddress, addressData, currentMarket } = state;
  const data = addressData?.[currentAddress];
  const addressProvided: boolean = !!(address && address?.length > 0);
  if (address?.length === 0 || address === "DEBUG") address = currentAddress || "";

  const riskOverrides: RiskParamOverrides | undefined =
    state.riskOverrides?.[address]?.[currentMarket];
  const sharedRiskConfig: SharedRiskConfig | null =
    state.sharedRiskConfig ?? null;
  const sharedRiskConfigEnabled: boolean = !!state.sharedRiskConfigEnabled;

  const effectiveRiskOverrides: RiskParamOverrides = mergeRiskOverrides(
    sharedRiskConfigEnabled && sharedRiskConfig?.marketId === currentMarket
      ? sharedRiskConfig.overrides
      : undefined,
    riskOverrides
  );

  const isLoadingAny = !!markets.find(
    (market) => data?.[market.id]?.isFetching === true
  );

  const deps = [currentAddress, addressProvided, isLoadingAny];

  useEffect(() => {
    if (preventFetch) return;
    if (addressProvided && !isLoadingAny) {
      markets.map((market) => {
        const existingData = data?.[market.id];
        const lastFetched = existingData?.lastFetched;
        if (lastFetched) return;
        if (existingData?.isFetching) return;
        setIsFetching(true);
        createInitial(market);
        const fetchData = async () => {
          const options = {
            method: "POST",
            body: JSON.stringify({ address, marketId: market.id }),
          };
          //const response: Response = await fetch("/api/aave", options);
          const data: HealthFactorData = await getAaveData(address, market);
          store.addressData.nested(address).merge({ [market.id]: data });
          /*
          if (response?.ok) {
            // ok, use the response
            const hfData: HealthFactorData = await response.json();
            store.addressData.nested(address).merge({ [market.id]: hfData });
          } else {
            // monkey up an errored HealthFactorData object
            const res = await response.json();
            const message: string = `${response.statusText}: --- ${res?.message ?? ""
              }`;
            const hfData: HealthFactorData = {
              address,
              fetchError: message,
              isFetching: false,
              lastFetched: Date.now(),
              market,
              marketReferenceCurrencyPriceInUSD: 1,
            };
            store.addressData.nested(address).merge({ [market.id]: hfData });
          }
          */
        };

        fetchData();

      });
    }
  }, deps);

  useEffect(() => {
    if (address) store.currentAddress.set(address);
  }, [address]);

  useEffect(() => {
    if (!isFetching) return;
    if (!markets.find((market) => data?.[market.id]?.isFetching)) {
      setIsFetching(false);
    }
  }, [isLoadingAny]);

  // After fetching, if the current market doesn't have a position but another
  // one does, select the market that has a position (prefer highest reserve balance).
  useEffect(() => {
    if (!isFetching && addressProvided) {
      const currentMarketHasPosition =
        data?.[currentMarket].workingData?.healthFactor &&
        (data?.[currentMarket]?.workingData?.healthFactor ?? -1) > -1;

      const currentMarketHasEdits =
        data?.[currentMarket]?.workingData?.healthFactor?.toFixed(2) !==
        data?.[currentMarket]?.fetchedData?.healthFactor?.toFixed(2);

      // Don't perform the auto-select if the user is actively editing the current market.
      if (currentMarketHasPosition && currentMarketHasEdits) return;

      const marketWithPosition = markets
        .sort((marketA, marketB) => {
          const marketDataA = data?.[marketA.id];
          const marketDataB = data?.[marketB.id];

          const totalCollA =
            marketDataA?.workingData?.totalCollateralMarketReferenceCurrency ||
            0;
          const totalCollB =
            marketDataB?.workingData?.totalCollateralMarketReferenceCurrency ||
            0;

          const priceA = marketDataA?.marketReferenceCurrencyPriceInUSD || 0;
          const priceB = marketDataB?.marketReferenceCurrencyPriceInUSD || 0;

          return totalCollB * priceB - totalCollA * priceA;
        })
        .find(
          (market) =>
            data?.[market.id]?.workingData?.healthFactor &&
            (data?.[market.id]?.workingData?.healthFactor ?? -1) > -1
        );
      // This guard doesn't make much sense but for some reason this useEffect was being triggered
      // sometimes even when the markets hadn't just finished loading. We only want to apply
      // this logic right after loading.
      const didFetchRecently = !!markets.find(
        (market) => data?.[market.id]?.lastFetched > Date.now() - 1000
      );
      if (marketWithPosition && didFetchRecently) {
        setCurrentMarket(marketWithPosition.id);
      }
    }
  }, [isFetching]);

  // Reconcile risk parameter overrides with derived position data. Overrides
  // are applied at recompute time (never baked into fetched values), so this
  // recomputes whenever the effective override set changes (including back to
  // empty, which restores on-chain parameters) or freshly-fetched market data
  // needs overrides applied.
  const effectiveOverridesKey = JSON.stringify(effectiveRiskOverrides);
  const currentMarketLastFetched = data?.[currentMarket]?.lastFetched || 0;
  const hasWorkingData = !!data?.[currentMarket]?.workingData;
  const lastAppliedOverridesKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasWorkingData) {
      lastAppliedOverridesKeyRef.current = null;
      return;
    }
    const overridesPresent = hasAnyRiskOverrides(effectiveRiskOverrides);
    const keyChanged =
      lastAppliedOverridesKeyRef.current !== null &&
      lastAppliedOverridesKeyRef.current !== effectiveOverridesKey;
    lastAppliedOverridesKeyRef.current = effectiveOverridesKey;
    if (overridesPresent || keyChanged) {
      updateAllDerivedHealthFactorData();
    }
  }, [
    effectiveOverridesKey,
    currentMarketLastFetched,
    currentMarket,
    hasWorkingData,
  ]);

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

  const setCurrentMarket = (marketId: string) => {
    store.currentMarket.set(marketId);
  };

  const addBorrowAsset = (symbol: string) => {
    const asset = data[currentMarket].availableAssets?.find(
      (a) => a.symbol === symbol
    ) as AssetDetails;

    asset.isNewlyAddedBySimUser = true;

    const borrow: BorrowedAssetDataItem = {
      asset,
      totalBorrows: 0,
      totalBorrowsUSD: 0,
      totalBorrowsMarketReferenceCurrency: 0,
      stableBorrowAPY: 0
    };

    const workingData = store.addressData.nested(address)?.[currentMarket]
      .workingData as State<AaveHealthFactorData>;

    workingData.userBorrowsData.merge([borrow]);
  };

  const addReserveAsset = (symbol: string) => {
    const asset: AssetDetails = data[currentMarket].availableAssets?.find(
      (a) => a.symbol === symbol
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
          })
        )
      )
    );
    updateAllDerivedHealthFactorData();
  };

  const setBorrowedAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userBorrowsData.find(
      (item) => item.asset.symbol.get() === symbol
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
      (item) => item.asset.symbol.get() === symbol
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
      (item) => item.asset.symbol.get() === symbol
    );
    if (reserveItem && reserveItem?.asset.priceInUSD.get() !== price)
      reserveItem.asset.priceInUSD.set(price);

    const borrowItem = workingData?.userBorrowsData.find(
      (item) => item.asset.symbol.get() === symbol
    );
    if (borrowItem && borrowItem?.asset.priceInUSD.get() !== price)
      borrowItem.asset.priceInUSD.set(price);
    updateAllDerivedHealthFactorData();
  };

  const applyLiquidationScenario = () => {
    const overrides = getEffectiveRiskOverridesFresh();
    const liquidationScenario = getCalculatedLiquidationScenario(
      data?.[currentMarket]?.workingData as AaveHealthFactorData,
      data?.[currentMarket]?.marketReferenceCurrencyPriceInUSD,
      hasAnyRiskOverrides(overrides) ? overrides : undefined
    ) as AssetDetails[];
    liquidationScenario?.forEach((asset) =>
      setAssetPriceInUSD(asset.symbol, asset.priceInUSD)
    );
  };

  const setUseReserveAssetAsCollateral = (symbol: string, value: boolean) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserveItem = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol
    );
    if (
      reserveItem &&
      reserveItem?.usageAsCollateralEnabledOnUser.get() !== value
    )
      reserveItem.usageAsCollateralEnabledOnUser.set(value);

    updateAllDerivedHealthFactorData();
  };

  const setCurrentAddress = (address: string) => {
    store.currentAddress.set(address);
  };

  /**
   * Effective overrides read fresh from the store (not the render closure),
   * so recomputes triggered inside mutators always see the latest values.
   */
  const getEffectiveRiskOverridesFresh = (): RiskParamOverrides => {
    const freshState = store.get({ noproxy: true });
    const manual = freshState.riskOverrides?.[address]?.[currentMarket];
    const shared =
      freshState.sharedRiskConfigEnabled &&
        freshState.sharedRiskConfig?.marketId === currentMarket
        ? freshState.sharedRiskConfig.overrides
        : undefined;
    return mergeRiskOverrides(shared, manual);
  };

  const setManualRiskOverrides = (
    updater: (prev: RiskParamOverrides) => RiskParamOverrides
  ) => {
    const all = store.riskOverrides.get({ noproxy: true }) || {};
    const prev: RiskParamOverrides = all?.[address]?.[currentMarket]
      ? JSON.parse(JSON.stringify(all[address][currentMarket]))
      : createEmptyRiskOverrides();
    const next = updater(prev);

    store.riskOverrides.set((current) => {
      const draft = { ...(current || {}) };
      const byMarket = { ...(draft[address] || {}) };
      if (hasAnyRiskOverrides(next)) {
        byMarket[currentMarket] = next;
      } else {
        delete byMarket[currentMarket];
      }
      if (Object.keys(byMarket).length) {
        draft[address] = byMarket;
      } else {
        delete draft[address];
      }
      return draft;
    });

    updateAllDerivedHealthFactorData();
  };

  /**
   * Set (or update fields of) the simulated risk parameter override for an
   * asset in the current market. Passing `undefined` for a field removes
   * that field's override; an entry with no remaining fields is dropped.
   */
  const setAssetRiskOverride = (
    symbol: string,
    override: Partial<AssetRiskOverride>
  ) => {
    setManualRiskOverrides((prev) => {
      const existing: Record<string, number | boolean | undefined> = {
        ...(prev.assets[symbol] || {}),
      };
      Object.entries(override).forEach(([field, value]) => {
        if (value === undefined) {
          delete existing[field];
        } else {
          existing[field] = value;
        }
      });
      return sanitizeRiskOverrides({
        ...prev,
        assets: { ...prev.assets, [symbol]: existing },
      });
    });
  };

  /** Remove all simulated risk parameter overrides for an asset. */
  const clearAssetRiskOverride = (symbol: string) => {
    setManualRiskOverrides((prev) => {
      const assets = { ...prev.assets };
      delete assets[symbol];
      return { ...prev, assets };
    });
  };

  /**
   * Set (or update fields of) the simulated override for an eMode category.
   * Category LTV/LT apply to every asset that is collateral in the category.
   */
  const setEModeCategoryRiskOverride = (
    categoryId: number,
    override: Partial<EModeCategoryOverride>
  ) => {
    setManualRiskOverrides((prev) => {
      const existing: Record<string, number | undefined> = {
        ...(prev.eModeCategories?.[String(categoryId)] || {}),
      };
      Object.entries(override).forEach(([field, value]) => {
        if (value === undefined) {
          delete existing[field];
        } else {
          existing[field] = value;
        }
      });
      return sanitizeRiskOverrides({
        ...prev,
        eModeCategories: {
          ...(prev.eModeCategories || {}),
          [String(categoryId)]: existing,
        },
      });
    });
  };

  /** Remove the simulated override for an eMode category. */
  const clearEModeCategoryRiskOverride = (categoryId: number) => {
    setManualRiskOverrides((prev) => {
      const eModeCategories = { ...(prev.eModeCategories || {}) };
      delete eModeCategories[String(categoryId)];
      return { ...prev, eModeCategories };
    });
  };

  /** Remove all manual risk parameter overrides for the current market. */
  const clearAllRiskOverrides = () => {
    setManualRiskOverrides(() => createEmptyRiskOverrides());
  };

  /**
   * Install (or remove, with null) a shared risk config decoded from a URL.
   * Selects the config's market so its effect is immediately visible.
   */
  const setSharedRiskConfig = (
    config: SharedRiskConfig | null,
    enabled: boolean = true
  ) => {
    store.sharedRiskConfig.set(
      config ? JSON.parse(JSON.stringify(config)) : null
    );
    store.sharedRiskConfigEnabled.set(enabled);
    if (config && store.currentMarket.get() !== config.marketId) {
      store.currentMarket.set(config.marketId);
    }
    // The override reconciliation effect recomputes derived data once the
    // config's market data is available.
  };

  /** Toggle whether the shared config is applied to the simulation. */
  const setSharedRiskConfigEnabled = (enabled: boolean) => {
    if (store.sharedRiskConfigEnabled.get() === enabled) return;
    store.sharedRiskConfigEnabled.set(enabled);
    if (data?.[currentMarket]?.workingData) {
      updateAllDerivedHealthFactorData();
    }
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

    const overrides = getEffectiveRiskOverridesFresh();

    const updatedWorkingData: AaveHealthFactorData =
      updateDerivedHealthFactorData(
        workingData,
        currentMarketReferenceCurrencyPriceInUSD,
        hasAnyRiskOverrides(overrides) ? overrides : undefined
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
    riskOverrides,
    effectiveRiskOverrides,
    sharedRiskConfig,
    sharedRiskConfigEnabled,
    setAssetRiskOverride,
    clearAssetRiskOverride,
    setEModeCategoryRiskOverride,
    clearEModeCategoryRiskOverride,
    clearAllRiskOverrides,
    setSharedRiskConfig,
    setSharedRiskConfigEnabled,
  };
}

/**
 *
 *  *** Aave-specific Utility Functions ***
 *
 */

export const getHealthFactorColor = (hf: number = 0) => {
  return hf < 1.1 ? "red" : hf > 3 ? "green" : "yellow";
};

export const isStablecoinAsset = (asset: AssetDetails) => {
  const stablecoinSymbols = [
    // Major USD stablecoins used in Aave
    "DAI", "USDC", "USDT", "TUSD", "USDP", "BUSD", "FRAX", "LUSD", "SUSD", "GUSD", "USDD", "DUSD",
    // Aave-specific stablecoins
    "GHO", "USD", "EUR", "MAI", "USDE", "SUSDE", "EUSDE",
    // Euro stablecoins used in Aave
    "EURT", "EURS", "AGEUR", "PAR"
  ];

  return !!stablecoinSymbols.find(symbol => asset.symbol?.toUpperCase().includes(symbol));
};

export const isActiveAsset = (asset: AssetDetails) => {
  return asset.isActive && !asset.isPaused && !asset.isFrozen;
};

export const isBorrowableAsset = (asset: AssetDetails) => {
  return isActiveAsset(asset) && asset.borrowingEnabled;
};

export const isSuppliableAsset = (asset: AssetDetails) => {
  return isActiveAsset(asset) && asset.usageAsCollateralEnabled;
};

export const isFlashloanableAsset = (asset: AssetDetails) => {
  return isActiveAsset(asset) && asset.flashLoanEnabled;
};

export const getEligibleLiquidationScenarioReserves = (
  hfData: AaveHealthFactorData
) => {
  const MINIMUM_CUMULATIVE_RESERVE_USD = 50;
  const MINIMUM_CUMULATIVE_RESERVE_PCT = 5;

  // Check if there are any borrowed assets that are not stablecoins
  // If so, exclude liquidation scenario entirely
  const hasNonStablecoinBorrows = hfData.userBorrowsData.some((borrowItem: BorrowedAssetDataItem) => {
    return !isStablecoinAsset(borrowItem.asset);
  });

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
        !eligibleReserves.find((reserveItem: ReserveAssetDataItem) => {
          return reserveItem.asset.symbol === borrowItem.asset.symbol;
        })
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
 * @param currentMarketReferenceCurrencyPriceInUSD the market reference currency price
 * @param riskOverrides optional simulated risk parameter overrides, applied at
 *   compute time (never written into the position data itself)
 * @returns hfData the updated healthFactorData
 */
export const updateDerivedHealthFactorData = (
  data: AaveHealthFactorData,
  currentMarketReferenceCurrencyPriceInUSD: number,
  riskOverrides?: RiskParamOverrides
) => {
  let updatedCurrentLiquidationThreshold: BigNumber = new BigNumber(0);
  let updatedCurrentLoanToValue: BigNumber = new BigNumber(0);
  let updatedHealthFactor: BigNumber = new BigNumber(0);
  let updatedAvailableBorrowsUSD: BigNumber = new BigNumber(0);
  let updatedAvailableBorrowsMarketReferenceCurrency: BigNumber = new BigNumber(
    0
  );
  let updatedTotalBorrowsUSD: BigNumber = new BigNumber(0);

  let updatedCollateral: BigNumber = new BigNumber(0);
  let weightedReservesETH: BigNumber = new BigNumber(0);
  let weightedLTVETH: BigNumber = new BigNumber(0);
  let totalBorrowsETH: BigNumber = new BigNumber(0);

  // eMode category overrides apply to the categories themselves (governance
  // changes them category-wide), so resolve them once up front.
  const effectiveEModes = applyEModeCategoryOverrides(
    data.eModes,
    riskOverrides
  );

  data.userReservesData.forEach((reserveItem) => {
    const underlyingBalance: BigNumber = new BigNumber(
      reserveItem.underlyingBalance
    );
    const priceInUSD: BigNumber = new BigNumber(reserveItem.asset.priceInUSD);

    // Update reserveItem.priceInMarketReferenceCurrency
    const existingPriceInMarketReferenceCurrency = new BigNumber(
      reserveItem.asset.priceInMarketReferenceCurrency
    );
    const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
      currentMarketReferenceCurrencyPriceInUSD
    );
    if (
      !existingPriceInMarketReferenceCurrency.isEqualTo(
        updatedMarketReferenceCurrency
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
        updatedUnderlyingBalanceMarketReferenceCurrency
      )
    ) {
      reserveItem.underlyingBalanceMarketReferenceCurrency =
        updatedUnderlyingBalanceMarketReferenceCurrency.toNumber();
    }

    // Update reserveItem.underlyingBalanceUSD
    const existingUnderlyingBalanceUSD = new BigNumber(
      reserveItem.underlyingBalanceUSD
    );
    const updatedUnderlyingBalanceUSD =
      underlyingBalance.multipliedBy(priceInUSD);
    if (!existingUnderlyingBalanceUSD.isEqualTo(updatedUnderlyingBalanceUSD)) {
      reserveItem.underlyingBalanceUSD = updatedUnderlyingBalanceUSD.toNumber();
    }

    // Resolve effective risk params (with any simulated overrides applied)
    // for every reserve so display stays consistent even for non-collateral
    // assets.
    const assetOverride = riskOverrides?.assets?.[reserveItem.asset.symbol];

    const risk = resolveEffectiveRiskParams({
      userEmodeCategoryId: data.userEmodeCategoryId,
      eModes: effectiveEModes,
      reserveId: reserveItem.asset.reserveId,
      baseLtv:
        assetOverride?.ltv ?? (reserveItem.asset.baseLTVasCollateral || 0),
      baseLiquidationThreshold:
        assetOverride?.liquidationThreshold ??
        (reserveItem.asset.reserveLiquidationThreshold || 0),
      legacyEModeCategoryId: reserveItem.asset.eModeCategoryId,
      legacyEModeLtv: assetOverride?.eModeLtv ?? reserveItem.asset.eModeLtv,
      legacyEModeLiquidationThreshold:
        assetOverride?.eModeLiquidationThreshold ??
        reserveItem.asset.eModeLiquidationThreshold,
    });
    reserveItem.asset.effectiveLtv = risk.ltv;
    reserveItem.asset.effectiveLiquidationThreshold = risk.liquidationThreshold;
    reserveItem.asset.isEModeCollateral = risk.isEMode;

    // An override can simulate the reserve being disabled as collateral
    // market-wide (e.g. a governance action), which drops its contribution
    // regardless of the user-level collateral toggle.
    const collateralDisabledByOverride =
      assetOverride?.usageAsCollateralEnabled === false;

    // Update the necessary accumulated values for updating healthFactor etc.
    if (reserveItem.usageAsCollateralEnabledOnUser && !collateralDisabledByOverride) {
      updatedCollateral = updatedCollateral.plus(
        updatedUnderlyingBalanceMarketReferenceCurrency
      );

      const itemReserveLiquidationThreshold: BigNumber = new BigNumber(
        risk.liquidationThreshold
      ).dividedBy(10000);
      const itemBaseLoanToValue: BigNumber = new BigNumber(risk.ltv).dividedBy(10000);

      weightedReservesETH = weightedReservesETH.plus(
        itemReserveLiquidationThreshold.multipliedBy(
          updatedUnderlyingBalanceMarketReferenceCurrency
        )
      );
      weightedLTVETH = weightedLTVETH.plus(
        itemBaseLoanToValue.multipliedBy(
          updatedUnderlyingBalanceMarketReferenceCurrency
        )
      );
    }
  });

  data.userBorrowsData.forEach((borrowItem) => {
    const totalBorrows: BigNumber = new BigNumber(borrowItem.totalBorrows);
    const priceInUSD: BigNumber = new BigNumber(borrowItem.asset.priceInUSD);

    // Update borrowItem.priceInMarketReferenceCurrency
    const existingPriceInMarketReferenceCurrency = new BigNumber(
      borrowItem.asset.priceInMarketReferenceCurrency
    );
    const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
      currentMarketReferenceCurrencyPriceInUSD
    );
    if (
      !existingPriceInMarketReferenceCurrency.isEqualTo(
        updatedMarketReferenceCurrency
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
        updatedTotalBorrowsMarketReferenceCurrency
      )
    ) {
      borrowItem.totalBorrowsMarketReferenceCurrency =
        updatedTotalBorrowsMarketReferenceCurrency.toNumber();
    }

    // Update borrowItem.totalBorrowsUSD
    const existingTotalBorrowsUSD = new BigNumber(borrowItem.totalBorrowsUSD);
    const updatedTotalBorrowsUSD = totalBorrows.multipliedBy(priceInUSD);
    if (!existingTotalBorrowsUSD.isEqualTo(updatedTotalBorrowsUSD)) {
      borrowItem.totalBorrowsUSD = updatedTotalBorrowsUSD.toNumber();
    }

    // Update the necessary accumulated values for updating healthFactor etc.
    totalBorrowsETH = totalBorrowsETH.plus(
      updatedTotalBorrowsMarketReferenceCurrency
    );
  });

  // Update "totalCollateralMarketReferenceCurrency"
  if (
    !updatedCollateral.isEqualTo(
      new BigNumber(data.totalCollateralMarketReferenceCurrency)
    )
  ) {
    data.totalCollateralMarketReferenceCurrency = updatedCollateral.toNumber();
  }

  // Update "totalBorrowsMarketReferenceCurrency"
  if (
    !totalBorrowsETH.isEqualTo(
      new BigNumber(data.totalBorrowsMarketReferenceCurrency)
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
      new BigNumber(data.currentLiquidationThreshold)
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
      currentMarketReferenceCurrencyPriceInUSD
    );

  if (updatedAvailableBorrowsUSD.isLessThan(0))
    updatedAvailableBorrowsUSD = new BigNumber(0);

  if (
    !updatedAvailableBorrowsUSD.isEqualTo(
      new BigNumber(data.availableBorrowsUSD)
    )
  ) {
    data.availableBorrowsUSD = updatedAvailableBorrowsUSD.toNumber();
  }

  // Update "totalBorrowsUSD"
  updatedTotalBorrowsUSD = totalBorrowsETH.multipliedBy(
    currentMarketReferenceCurrencyPriceInUSD
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
  riskOverrides?: RiskParamOverrides
) => {
  if (!hfData) return [];
  // deep clone to avoid mutating state
  hfData = JSON.parse(JSON.stringify(hfData)) as AaveHealthFactorData;

  const reserves: ReserveAssetDataItem[] =
    getEligibleLiquidationScenarioReserves(hfData);

  let assets: AssetDetails[] = reserves.map(
    (res: ReserveAssetDataItem) => res.asset
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
    i++;

    assets.forEach((asset) => {
      let priceIncrement = (asset.priceInUSD || 1) * 0.1;

      priceIncrement =
        Math.round((priceIncrement + Number.EPSILON) * 100) / 100;

      asset.priceInUSD = asset.priceInUSD + priceIncrement;

      const reserveItemAsset = hfData.userReservesData.find(
        (item) => item.asset.symbol === asset.symbol
      );

      if (reserveItemAsset)
        reserveItemAsset.asset.priceInUSD = asset.priceInUSD;

      const borrowItemAsset = hfData.userBorrowsData.find(
        (item) => item.asset.symbol === asset.symbol
      );

      if (borrowItemAsset) borrowItemAsset.asset.priceInUSD = asset.priceInUSD;

      const updatedWorkingData = updateDerivedHealthFactorData(
        hfData,
        currentMarketReferenceCurrencyPriceInUSD,
        riskOverrides
      );

      hf = updatedWorkingData.healthFactor;
    });
  }

  let shortCircuit = false;

  // Next, uniformly decrement the asset prices until we approach the liquidation threshold.
  while (hf > HF_LIMIT && i < SHORT_CIRCUIT_LOOP_LIMIT && !shortCircuit) {
    i++;

    // Track a uniform percentage to decrement asset prices, so that the overall decrement percentage
    // for all assets will be approximately the same.
    let decrementPercentage = 0;

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
            asset.priceInUSD * 0.5
          )
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
        if (!assets.find((asset) => asset.priceInUSD > 0.01)) {
          shortCircuit = true;
        }
      }

      const reserveItemAsset = hfData.userReservesData.find(
        (item) => item.asset.symbol === asset.symbol
      );

      if (reserveItemAsset)
        reserveItemAsset.asset.priceInUSD = asset.priceInUSD;

      const borrowItemAsset = hfData.userBorrowsData.find(
        (item) => item.asset.symbol === asset.symbol
      );

      if (borrowItemAsset) borrowItemAsset.asset.priceInUSD = asset.priceInUSD;

      const updatedWorkingData = updateDerivedHealthFactorData(
        hfData,
        currentMarketReferenceCurrencyPriceInUSD,
        riskOverrides
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
      iconName = ptMatch[1];
    }
  }

  // Handle Ethereal/Ethena tokens
  if (iconName.includes("ethereal") || iconName.includes("ethena")) {
    // Extract the base token from the long name
    // e.g., "PT Ethereal eUSDE 14AUG2025" -> "eusde"
    // e.g., "PT Ethena sUSDE 25SEP2025" -> "susde"
    const etherealMatch = iconName.match(/(eusde|susde|usde)/);
    if (etherealMatch) {
      iconName = etherealMatch[1];
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

export const getIconNameFromMarket = (market?: AaveMarketDataType) => {
  return market?.id
    ?.split("_")[0]
    .replace("BNB", "binance") // special case... follow aave interface convention
    .toLowerCase() || "";
};
