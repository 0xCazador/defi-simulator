import { forwardRef } from 'react';
import { Group, Avatar, Text, Select } from '@mantine/core';
import { t, Trans } from "@lingui/macro";
import { i18n } from "@lingui/core"

import langItems from "../src/languages/index.json";
import { NextRouter, useRouter } from 'next/router';
import { useFiatRates } from '../hooks/useFiatData';

import currencies from '../src/currencies/index.json';

type LocalizedFiatDisplayProps = {
    valueUSD: number,
    includeCurrencyCode?: boolean
};

export const getLocalizedFiatString = (valueUSD: number, currentRate: number, selectedCurrency: string) => {
    const value = currentRate * valueUSD;
    return i18n.number(value, { style: "currency", currency: selectedCurrency });
}

export default function LocalizedFiatDisplay({ valueUSD, includeCurrencyCode = false }: LocalizedFiatDisplayProps) {
    const { selectedCurrency, currentRate } = useFiatRates(false);
    let currencyString = getLocalizedFiatString(valueUSD, currentRate, selectedCurrency);
    if (includeCurrencyCode) currencyString += ` (${selectedCurrency})`
    return <>{currencyString}</>;
}

