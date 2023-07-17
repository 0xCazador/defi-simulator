import { forwardRef } from 'react';
import { Group, Avatar, Text, Select } from '@mantine/core';
import { t, Trans } from "@lingui/macro";
import { i18n } from "@lingui/core"

import langItems from "../src/languages/index.json";
import { NextRouter, useRouter } from 'next/router';
import { useFiatRates } from '../hooks/useFiatData';

import currencies from '../src/currencies/index.json';
import { useLingui } from '@lingui/react';

type LocalizedFiatDisplayProps = {
    valueUSD: number,
    includeCurrencyCode?: boolean
};

export const getLocalizedFiatString = (valueUSD: number, currentRate: number, selectedCurrency: string, locale: string = "en") => {
    const value = currentRate * valueUSD;
    return i18n.number(value, { style: "currency", currency: selectedCurrency });
}

export default function LocalizedFiatDisplay({ valueUSD, includeCurrencyCode = false }: LocalizedFiatDisplayProps) {
    const { i18n } = useLingui();
    const { selectedCurrency, currentRate } = useFiatRates(false);

    const convertedValue = currentRate * valueUSD;

    let currencyString = i18n.number(convertedValue, { style: "currency", currency: selectedCurrency });

    if (includeCurrencyCode) currencyString += ` (${selectedCurrency})`

    return <>{currencyString}</>;
}

