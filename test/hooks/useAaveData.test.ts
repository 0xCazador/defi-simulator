import { expect } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAaveData, markets, AaveHealthFactorData, getCalculatedLiquidationScenario } from '../../hooks/useAaveData';
import testDataItems from '../fixtures/aave/AaveHealthFactorData.json';
import fetchMock from 'jest-fetch-mock';

const PRECISION = 6;

const items = testDataItems.filter(
  (item) => item.address === '0x6b993dd11995a88e6e8d60f21401344e166cb231'
);

describe.each(testDataItems)(`useAaveData ()`, (testDataItem) => {
  /**
   * find a reserve item with a relatively high balance that is not also borrowed.
   * the test cases are more complicated when manipulating the price of a reserve that is
   * also borrowed so just ignore that scenario for now.
   */
  const reserveDataItem = testDataItem.userReservesData
    .sort((a, b) => b.underlyingBalanceUSD - a.underlyingBalanceUSD)
    .find(
      (reserve) =>
        reserve.asset.usageAsCollateralEnabled &&
        !testDataItem.userBorrowsData.find((borrow) => borrow.asset.symbol === reserve.asset.symbol)
    );

  if (!reserveDataItem) return;

  beforeEach(() => {
    fetchMock.resetMocks();
    const testHF = getHFDataFromAaveDataSeed(testDataItem);
    fetchMock.mockResponse(JSON.stringify(testHF));
  });

  describe(`when an address is passed in (${testDataItem.address})`, () => {
    test('it requests address data for each market', async () => {
      const { result } = renderHook(() => useAaveData(testDataItem.address));

      await waitFor(() => {
        const data = result.current.addressData?.[result.current.currentMarket];
        expect(data.workingData).not.toBeUndefined();
        expect(fetch).toHaveBeenCalledTimes(markets.length);
      });

      const data = result.current.addressData?.[result.current.currentMarket];

      expect(result.current.currentAddress).toEqual(testDataItem.address);
      expect(data.workingData).not.toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(markets.length);
    });

    describe('when a reserve asset quantity is changed', () => {
      test('it should modify the health factor and availableBorrowsUSD correctly', async () => {
        const { result } = renderHook(() => useAaveData(testDataItem.address));
        if (!reserveDataItem) return;
        const originalAssetQty: number = reserveDataItem.underlyingBalance;
        const originalHealthFactor: number = testDataItem.healthFactor;
        const originalAvailableBorrows: number = testDataItem.availableBorrowsUSD;

        await waitFor(() => {
          const data = result.current.addressData?.[result.current.currentMarket];
          expect(data.workingData).not.toBeUndefined();
        });

        act(() => {
          const updatedQty = Math.max(originalAssetQty * 10, 100);
          result.current.setReserveAssetQuantity(reserveDataItem.asset.symbol, updatedQty);
        });

        const data = result.current.addressData?.[result.current.currentMarket];

        expect(data.workingData?.healthFactor).toBeGreaterThan(originalHealthFactor);
        expect(data.workingData?.availableBorrowsUSD).toBeGreaterThan(originalAvailableBorrows);

        act(() => {
          const updatedQty = Math.max(originalAssetQty - 10, 0);
          result.current.setReserveAssetQuantity(reserveDataItem.asset.symbol, updatedQty);
        });

        expect(data.workingData?.healthFactor).toBeLessThan(originalHealthFactor);
        expect(data.workingData?.availableBorrowsUSD).toBeLessThanOrEqual(originalAvailableBorrows); // Equal in case original was 0

        act(() => {
          result.current.setReserveAssetQuantity(reserveDataItem.asset.symbol, originalAssetQty);
        });

        expect(data.workingData?.healthFactor.toFixed(PRECISION)).toEqual(
          originalHealthFactor.toFixed(PRECISION)
        );
        expect(data.workingData?.availableBorrowsUSD.toFixed(PRECISION)).toEqual(
          originalAvailableBorrows.toFixed(PRECISION)
        );
      });
    });

    describe('when a reserve asset price is changed', () => {
      test('it should modify the health factor and availableBorrowsUSD correctly', async () => {
        const { result } = renderHook(() => useAaveData(testDataItem.address));
        if (!reserveDataItem) return;
        const originalAssetPrice: number = reserveDataItem.asset.priceInUSD;
        const originalHealthFactor: number = testDataItem.healthFactor;
        const originalAvailableBorrows: number = testDataItem.availableBorrowsUSD;

        await waitFor(() => {
          const data = result.current.addressData?.[result.current.currentMarket];
          expect(data.workingData).not.toBeUndefined();
        });

        act(() => {
          const updatedPrice = Math.max(originalAssetPrice * 10, 100);
          result.current.setAssetPriceInUSD(reserveDataItem.asset.symbol, updatedPrice);
        });

        const data = result.current.addressData?.[result.current.currentMarket];

        if (
          // only one asset both reserve and borrowed e.g. reserve and borrow only USDC
          testDataItem.userReservesData.length === 1 &&
          testDataItem.userBorrowsData.length === 1 &&
          testDataItem.userReservesData[0].asset.symbol ===
          testDataItem.userBorrowsData[0].asset.symbol
        ) {
          expect(data.workingData?.healthFactor).toEqual(originalHealthFactor);
        } else {
          // every other scenario
          expect(data.workingData?.healthFactor).toBeGreaterThan(originalHealthFactor);
        }

        expect(data.workingData?.availableBorrowsUSD).toBeGreaterThan(originalAvailableBorrows);

        act(() => {
          const updatedPrice = Math.max(originalAssetPrice - 10, 0);
          result.current.setAssetPriceInUSD(reserveDataItem.asset.symbol, updatedPrice);
        });

        expect(data.workingData?.healthFactor).toBeLessThan(originalHealthFactor);
        expect(data.workingData?.availableBorrowsUSD).toBeLessThanOrEqual(originalAvailableBorrows); // Equal in case original was 0

        act(() => {
          result.current.setAssetPriceInUSD(reserveDataItem.asset.symbol, originalAssetPrice);
        });

        expect(data.workingData?.healthFactor.toFixed(PRECISION)).toEqual(
          originalHealthFactor.toFixed(PRECISION)
        );
        expect(data.workingData?.availableBorrowsUSD.toFixed(PRECISION)).toEqual(
          originalAvailableBorrows.toFixed(PRECISION)
        );
      });
    });

    describe('when a reserve asset usageAsCollateralEnabledOnUser is changed', () => {
      test('it should modify the health factor and availableBorrowsUSD correctly', async () => {
        const { result } = renderHook(() => useAaveData(testDataItem.address));
        if (!reserveDataItem) return;
        const originalHealthFactor: number = testDataItem.healthFactor;
        const originalAvailableBorrows: number = testDataItem.availableBorrowsUSD;

        await waitFor(() => {
          const data = result.current.addressData?.[result.current.currentMarket];
          expect(data.workingData).not.toBeUndefined();
        });

        act(() => {
          result.current.setUseReserveAssetAsCollateral(reserveDataItem.asset.symbol, false);
        });

        const data = result.current.addressData?.[result.current.currentMarket];

        expect(data.workingData?.healthFactor).toBeLessThan(originalHealthFactor);
        expect(data.workingData?.availableBorrowsUSD).toBeLessThanOrEqual(originalAvailableBorrows); // Equal in case original was 0

        act(() => {
          result.current.setUseReserveAssetAsCollateral(reserveDataItem.asset.symbol, true);
        });

        expect(data.workingData?.healthFactor.toFixed(PRECISION)).toEqual(
          originalHealthFactor.toFixed(PRECISION)
        );
        expect(data.workingData?.availableBorrowsUSD.toFixed(PRECISION)).toEqual(
          originalAvailableBorrows.toFixed(PRECISION)
        );
      });
    });

    test('it correctly calculates liquidation scenario', async () => {
      const { result } = renderHook(() => useAaveData(testDataItem.address));

      await waitFor(() => {
        const data = result.current.addressData?.[result.current.currentMarket];
        expect(data.workingData).not.toBeUndefined();
      });

      const data = result.current.addressData?.[result.current.currentMarket];

      const liquidationScenario = getCalculatedLiquidationScenario(data.workingData as AaveHealthFactorData, data.marketReferenceCurrencyPriceInUSD);

      expect(liquidationScenario).not.toBeUndefined();

      if (liquidationScenario.length === 0) return;

      // Apply the liquidation scenario, and then check if the hf is 1.00
      liquidationScenario?.forEach(asset => {
        act(() => {
          result.current.setAssetPriceInUSD(asset.symbol, asset.priceInUSD);
        });
      });

      // HF rounded to hundredths
      const expectedHF: number = Math.round((data.workingData?.healthFactor || 0 + Number.EPSILON) * 100) / 100
      expect(expectedHF).toEqual(1.00);
    });

  });
});

const getHFDataFromAaveDataSeed = (aaveData: AaveHealthFactorData) => {
  return {
    address: aaveData.address,
    marketReferenceCurrencyPriceInUSD: 10000,
    fetchedData: aaveData,
    workingData: aaveData,
    lastFetched: Date.now(),
  };
};
