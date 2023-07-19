import { useEffect, useState } from 'react';
import { useHookstate, State } from '@hookstate/core';

import { FiatRatesDataStore } from '../store/fiatRatesDataStore';

import currencies from '../src/currencies/index.json';

/** hook to fetch fiat exchange rates
 * @returns { currentAddress,
    isFetching,
    isError,
    selectedCurrency,
    currentRate,
    currencyData,
    setSelectedCurrency }
 */
export function useFiatRates(shouldFetch: boolean = false) {
    const store = useHookstate(FiatRatesDataStore);
    const state = store.get({ noproxy: true });
    const { selectedCurrency, lastFetched, isFetching, isError, currencyData } = state;

    useEffect(() => {
        if (shouldFetch && !isFetching && lastFetched < Date.now() - 60000) {
            store.isFetching.set(true);

            const fetchData = async () => {
                const response: Response = await fetch("https://api.coinbase.com/v2/exchange-rates");
                const responseData = await response.json();
                const rateData = responseData.data.rates;
                const symbols = Object.keys(rateData);
                const cleanedRateData = {};
                symbols
                    .filter(symbol => currencies.find(curr => curr.code === symbol))
                    .forEach(symbol => cleanedRateData[symbol] = Number(rateData[symbol])); // cast values to num
                store.currencyData.set(cleanedRateData);
                store.lastFetched.set(Date.now());
                store.isFetching.set(false);
            };
            fetchData();
        }
    }, [shouldFetch, isFetching, lastFetched]);



    const setSelectedCurrency = (currencySymbol: string) => {
        store.selectedCurrency.set(currencySymbol);
    };

    //console.log({ state })

    return {
        isFetching,
        isError,
        selectedCurrency,
        currentRate: selectedCurrency === "USD" ? 1 : currencyData[selectedCurrency],
        currencyData,
        setSelectedCurrency
    };
}

