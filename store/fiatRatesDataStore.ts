import React from 'react';
import { hookstate } from '@hookstate/core';

interface FiatRatesStore {
    selectedCurrency: string;
    isFetching: boolean,
    isError: boolean,
    lastFetched: number;
    currencyData: Record<string, number>;
}

const defaultState: FiatRatesStore = {
    selectedCurrency: 'USD',
    lastFetched: 0,
    isFetching: false,
    isError: false,
    currencyData: {},
};

export const FiatRatesDataStore: FiatRatesStore = hookstate(defaultState);
