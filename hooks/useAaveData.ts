import { useEffect, useState } from 'react';
import { useHookstate, State } from '@hookstate/core';
import * as pools from '@bgd-labs/aave-address-book';

import { HealthFactorDataStore } from '../store/healthFactorDataStore';

import { ChainId } from '@aave/contract-helpers';
import BigNumber from 'bignumber.js';

export type HealthFactorData = {
  address: string;
  fetchError: string;
  isFetching: boolean;
  lastFetched: number;
  market: AaveMarketDataType;
  marketReferenceCurrencyPriceInUSD: number;
  availableAssets?: AssetDetails[];
  fetchedData?: AaveHealthFactorData;
  workingData?: AaveHealthFactorData;
};

export type UserReservesData = {
  healthFactor: string;
  totalBorrowsUSD: string;
  availableBorrowsUSD: string;
  userReservesData: [ReserveAssetDataItem];
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
  aTokenAddress?: string;
  stableDebtTokenAddress?: string;
  variableDebtTokenAddress?: string;
  isNewlyAddedBySimUser?: boolean;
};

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
};

export const markets: AaveMarketDataType[] = [
  {
    v3: false,
    id: 'ETHEREUM_V2',
    title: 'Ethereum v2',
    chainId: ChainId.mainnet,
    api: 'https://eth-mainnet.alchemyapi.io/v2/{{ALCHEMY_API_KEY}}',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV2Ethereum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV2Ethereum.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: true,
    id: 'ETHEREUM_V3',
    title: 'Ethereum v3',
    chainId: ChainId.mainnet,
    api: 'https://eth-mainnet.alchemyapi.io/v2/{{ALCHEMY_API_KEY}}',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Ethereum.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: true,
    id: 'ARBITRUM_V3',
    title: 'Arbitrum v3',
    chainId: ChainId.arbitrum_one,
    api: 'https://arb-mainnet.g.alchemy.com/v2/{{ALCHEMY_API_KEY}}',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Arbitrum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Arbitrum.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: true,
    id: 'OPTIMISM_V3',
    title: 'Optimism v3',
    chainId: ChainId.optimism,
    api: 'https://opt-mainnet.g.alchemy.com/v2/{{ALCHEMY_API_KEY}}',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Optimism.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Optimism.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: false,
    id: 'POLYGON_V2',
    title: 'Polygon v2',
    chainId: ChainId.polygon,
    api: 'https://polygon-mainnet.g.alchemy.com/v2/{{ALCHEMY_API_KEY}}',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV2Polygon.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV2Polygon.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: true,
    id: 'POLYGON_V3',
    title: 'Polygon v3',
    chainId: ChainId.polygon,
    api: 'https://polygon-mainnet.g.alchemy.com/v2/{{ALCHEMY_API_KEY}}',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Polygon.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Polygon.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: false,
    id: 'AVALANCHE_V2',
    title: 'Avalanche v2',
    chainId: ChainId.avalanche,
    api: 'https://api.avax.network/ext/bc/C/rpc',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV2Avalanche.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV2Avalanche.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: true,
    id: 'AVALANCHE_V3',
    title: 'Avalanche v3',
    chainId: ChainId.avalanche,
    api: 'https://api.avax.network/ext/bc/C/rpc',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Avalanche.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Avalanche.UI_POOL_DATA_PROVIDER,
    },
  },
  {
    v3: true,
    id: 'METIS_V3',
    title: 'Metis v3',
    chainId: ChainId.metis_andromeda,
    api: 'https://andromeda.metis.io/?owner=1088',
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Metis.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Metis.UI_POOL_DATA_PROVIDER,
    },
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
export function useAaveData(address: string) {
  const [isFetching, setIsFetching] = useState(false);
  const store = useHookstate(HealthFactorDataStore);
  const state = store.get({ noproxy: true });
  const { currentAddress, addressData, currentMarket } = state;
  const data = addressData?.[currentAddress];
  const addressProvided = address && address.length > 0;
  if (address?.length === 0) address = currentAddress || '';

  const isLoadingAny = !!markets.find((market) => data?.[market.id]?.isFetching);

  useEffect(() => {
    if (addressProvided && !isLoadingAny) {
      markets.map((market) => {
        const existingData = data?.[market.id];
        const lastFetched = existingData?.lastFetched;
        // Consider stale and re-fetch if more than 30 seconds old
        if (lastFetched && lastFetched > Date.now() - 30000) return;
        if (existingData?.isFetching) return;
        setIsFetching(true);
        createInitial(market);
        const fetchData = async () => {
          const options = {
            method: 'POST',
            body: JSON.stringify({ address, marketId: market.id }),
          };
          const response: Response = await fetch('/api/aave', options);
          const hfData: HealthFactorData = await response.json();
          store.addressData.nested(address).merge({ [market.id]: hfData });
        };
        fetchData();
      });
    }
  }, [currentAddress, addressProvided, isLoadingAny]);

  useEffect(() => {
    if (address) store.currentAddress.set(address);
  }, [address]);

  useEffect(() => {
    if (!isFetching) return;
    if (!markets.find((market) => data?.[market.id]?.isFetching)) {
      setIsFetching(false);
    }
  }, [...markets.map((market) => data?.[market.id]?.isFetching)]);

  useEffect(() => {
    if (!isFetching) {
      const currentMarketHasPosition =
        data?.[currentMarket].workingData?.healthFactor &&
        (data?.[currentMarket]?.workingData?.healthFactor ?? -1) > -1;
      if (currentMarketHasPosition) return;
      const marketWithPosition = markets.find(
        (market) =>
          data?.[market.id]?.workingData?.healthFactor &&
          (data?.[market.id]?.workingData?.healthFactor ?? -1) > -1
      );
      if (marketWithPosition) setCurrentMarket(marketWithPosition.id);
    }
  }, [isFetching]);

  const createInitial = (market: AaveMarketDataType) => {
    const hf: HealthFactorData = {
      address,
      fetchError: '',
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
      assetType === 'RESERVE'
        ? data?.[currentMarket]?.workingData?.userReservesData || []
        : data?.[currentMarket]?.workingData?.userBorrowsData || [];

    const itemIndex = items.findIndex((item) => item.asset.symbol === symbol);
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserves: State<ReserveAssetDataItem[]> = workingData.userReservesData;
    const borrows: State<BorrowedAssetDataItem[]> = workingData.userBorrowsData;

    assetType === 'RESERVE'
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
    store.addressData
      .nested(address)
      ?.[currentMarket].workingData.set(
        JSON.parse(
          JSON.stringify(
            store.addressData[currentAddress][currentMarket].fetchedData.get({ noproxy: true })
          )
        )
      );
  };

  const setBorrowedAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userBorrowsData.find((item) => item.asset.symbol.get() === symbol);
    if (item?.totalBorrows.get() !== quantity) {
      item?.totalBorrows.set(quantity);
      updateAllDerivedHealthFactorData();
    }
  };

  const setReserveAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userReservesData.find((item) => item.asset.symbol.get() === symbol);

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

  const setUseReserveAssetAsCollateral = (symbol: string, value: boolean) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserveItem = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol
    );
    if (reserveItem && reserveItem?.usageAsCollateralEnabledOnUser.get() !== value)
      reserveItem.usageAsCollateralEnabledOnUser.set(value);

    updateAllDerivedHealthFactorData();
  };

  const setCurrentAddress = (address: string) => {
    store.currentAddress.set(address);
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
  const updateAllDerivedHealthFactorData = () => {
    let updatedCurrentLiquidationThreshold: BigNumber = new BigNumber(0);
    let updatedCurrentLoanToValue: BigNumber = new BigNumber(0);
    let updatedHealthFactor: BigNumber = new BigNumber(0);
    let updatedAvailableBorrowsUSD: BigNumber = new BigNumber(0);
    let updatedAvailableBorrowsMarketReferenceCurrency: BigNumber = new BigNumber(0);
    let updatedTotalBorrowsUSD: BigNumber = new BigNumber(0);

    let updatedCollateral: BigNumber = new BigNumber(0);
    let weightedReservesETH: BigNumber = new BigNumber(0);
    let weightedLTVETH: BigNumber = new BigNumber(0);
    let totalBorrowsETH: BigNumber = new BigNumber(0);

    const currentMarketReferenceCurrencyPriceInUSD: BigNumber = new BigNumber(
      store.addressData.nested(address)[currentMarket].marketReferenceCurrencyPriceInUSD.get()
    );

    const healthFactorItem = store.addressData.nested(address)?.[
      currentMarket
    ] as State<HealthFactorData>;

    const workingData = healthFactorItem.workingData as State<AaveHealthFactorData>;

    workingData.userReservesData.forEach((reserveItem) => {
      const underlyingBalance: BigNumber = new BigNumber(reserveItem.underlyingBalance.get());
      const priceInUSD: BigNumber = new BigNumber(reserveItem.asset.priceInUSD.get());

      // Update reserveItem.priceInMarketReferenceCurrency
      const existingPriceInMarketReferenceCurrency = new BigNumber(
        reserveItem.asset.priceInMarketReferenceCurrency.get()
      );
      const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
        currentMarketReferenceCurrencyPriceInUSD
      );
      if (!existingPriceInMarketReferenceCurrency.isEqualTo(updatedMarketReferenceCurrency)) {
        reserveItem.asset
          .nested('priceInMarketReferenceCurrency')
          .set(updatedMarketReferenceCurrency.toNumber());
      }

      // Update reserveItem.underlyingBalanceMarketReferenceCurrency
      const existingUnderlyingBalanceMarketReferenceCurrency: BigNumber = new BigNumber(
        reserveItem.underlyingBalanceMarketReferenceCurrency.get()
      );
      const updatedUnderlyingBalanceMarketReferenceCurrency =
        updatedMarketReferenceCurrency.multipliedBy(underlyingBalance);
      if (
        !existingUnderlyingBalanceMarketReferenceCurrency.isEqualTo(
          updatedUnderlyingBalanceMarketReferenceCurrency
        )
      ) {
        reserveItem
          .nested('underlyingBalanceMarketReferenceCurrency')
          .set(updatedUnderlyingBalanceMarketReferenceCurrency.toNumber());
      }

      // Update reserveItem.underlyingBalanceUSD
      const existingUnderlyingBalanceUSD = new BigNumber(reserveItem.underlyingBalanceUSD.get());
      const updatedUnderlyingBalanceUSD = underlyingBalance.multipliedBy(priceInUSD);
      if (!existingUnderlyingBalanceUSD.isEqualTo(updatedUnderlyingBalanceUSD)) {
        reserveItem.nested('underlyingBalanceUSD').set(updatedUnderlyingBalanceUSD.toNumber());
      }

      // Update the necessary accumulated values for updating healthFactor etc.
      if (reserveItem.usageAsCollateralEnabledOnUser.get()) {
        updatedCollateral = updatedCollateral.plus(updatedUnderlyingBalanceMarketReferenceCurrency);

        const itemReserveLiquidationThreshold: BigNumber = new BigNumber(
          reserveItem.asset.reserveLiquidationThreshold.get()
        ).dividedBy(10000);
        const itemBaseLoanToValue: BigNumber = new BigNumber(
          reserveItem.asset.baseLTVasCollateral.get()
        ).dividedBy(10000);

        weightedReservesETH = weightedReservesETH.plus(
          itemReserveLiquidationThreshold.multipliedBy(
            updatedUnderlyingBalanceMarketReferenceCurrency
          )
        );
        weightedLTVETH = weightedLTVETH.plus(
          itemBaseLoanToValue.multipliedBy(updatedUnderlyingBalanceMarketReferenceCurrency)
        );
      }
    });

    workingData.userBorrowsData.forEach((borrowItem) => {
      const totalBorrows: BigNumber = new BigNumber(borrowItem.totalBorrows.get());
      const priceInUSD: BigNumber = new BigNumber(borrowItem.asset.priceInUSD.get());

      // Update borrowItem.priceInMarketReferenceCurrency
      const existingPriceInMarketReferenceCurrency = new BigNumber(
        borrowItem.asset.priceInMarketReferenceCurrency.get()
      );
      const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
        currentMarketReferenceCurrencyPriceInUSD
      );
      if (!existingPriceInMarketReferenceCurrency.isEqualTo(updatedMarketReferenceCurrency)) {
        borrowItem.asset
          .nested('priceInMarketReferenceCurrency')
          .set(updatedMarketReferenceCurrency.toNumber());
      }

      // Update borrowItem.totalBorrowsMarketReferenceCurrency
      const existingTotalBorrowsMarketReferenceCurrency: BigNumber = new BigNumber(
        borrowItem.totalBorrowsMarketReferenceCurrency.get()
      );
      const updatedTotalBorrowsMarketReferenceCurrency =
        updatedMarketReferenceCurrency.multipliedBy(totalBorrows);
      if (
        !existingTotalBorrowsMarketReferenceCurrency.isEqualTo(
          updatedTotalBorrowsMarketReferenceCurrency
        )
      ) {
        borrowItem
          .nested('totalBorrowsMarketReferenceCurrency')
          .set(updatedTotalBorrowsMarketReferenceCurrency.toNumber());
      }

      // Update borrowItem.totalBorrowsUSD
      const existingTotalBorrowsUSD = new BigNumber(borrowItem.totalBorrowsUSD.get());
      const updatedTotalBorrowsUSD = totalBorrows.multipliedBy(priceInUSD);
      if (!existingTotalBorrowsUSD.isEqualTo(updatedTotalBorrowsUSD)) {
        borrowItem.nested('totalBorrowsUSD').set(updatedTotalBorrowsUSD.toNumber());
      }

      // Update the necessary accumulated values for updating healthFactor etc.
      totalBorrowsETH = totalBorrowsETH.plus(updatedTotalBorrowsMarketReferenceCurrency);
    });

    // Update "totalCollateralMarketReferenceCurrency"
    if (
      !updatedCollateral.isEqualTo(
        new BigNumber(workingData.totalCollateralMarketReferenceCurrency.get())
      )
    ) {
      workingData
        .nested('totalCollateralMarketReferenceCurrency')
        .set(updatedCollateral.toNumber());
    }

    // Updated "currentLiquidationThreshold"
    if (weightedReservesETH.isGreaterThan(0) && updatedCollateral.isGreaterThan(0)) {
      updatedCurrentLiquidationThreshold = weightedReservesETH.dividedBy(updatedCollateral);
    }

    if (
      !updatedCurrentLiquidationThreshold.isEqualTo(
        new BigNumber(workingData.nested('currentLiquidationThreshold').get())
      )
    ) {
      workingData
        .nested('currentLiquidationThreshold')
        .set(updatedCurrentLiquidationThreshold.toNumber());
    }

    // Update "currentLoanToValue"
    if (weightedLTVETH.isGreaterThan(0) && updatedCollateral.isGreaterThan(0)) {
      updatedCurrentLoanToValue = weightedLTVETH.dividedBy(updatedCollateral);
    }
    if (
      !updatedCurrentLoanToValue.isEqualTo(
        new BigNumber(workingData.nested('currentLoanToValue').get())
      )
    ) {
      workingData.nested('currentLoanToValue').set(updatedCurrentLoanToValue.toNumber());
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

    if (!updatedHealthFactor.isEqualTo(new BigNumber(workingData.nested('healthFactor').get()))) {
      workingData.nested('healthFactor').set(updatedHealthFactor.toNumber());
    }

    // Update "availableBorrowsUSD"
    updatedAvailableBorrowsMarketReferenceCurrency = updatedCollateral
      .multipliedBy(updatedCurrentLoanToValue)
      .minus(totalBorrowsETH);
    updatedAvailableBorrowsUSD = updatedAvailableBorrowsMarketReferenceCurrency.multipliedBy(
      currentMarketReferenceCurrencyPriceInUSD
    );

    if (updatedAvailableBorrowsUSD.isLessThan(0)) updatedAvailableBorrowsUSD = new BigNumber(0);

    if (
      !updatedAvailableBorrowsUSD.isEqualTo(
        new BigNumber(workingData.nested('availableBorrowsUSD').get())
      )
    ) {
      workingData.nested('availableBorrowsUSD').set(updatedAvailableBorrowsUSD.toNumber());
    }

    // Update "totalBorrowsUSD"
    updatedTotalBorrowsUSD = totalBorrowsETH.multipliedBy(currentMarketReferenceCurrencyPriceInUSD);

    if (
      !updatedTotalBorrowsUSD.isEqualTo(new BigNumber(workingData.nested('totalBorrowsUSD').get()))
    ) {
      workingData.nested('totalBorrowsUSD').set(updatedTotalBorrowsUSD.toNumber());
    }
  };

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
    setUseReserveAssetAsCollateral,
  };
}
