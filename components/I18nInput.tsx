import { forwardRef } from 'react';
import { Group, Avatar, Text, Select } from '@mantine/core';
import { t, Trans } from "@lingui/macro";

import langItems from "../src/languages/index.json";
import { NextRouter, useRouter } from 'next/router';
import { useFiatRates } from '../hooks/useFiatData';

import currencies from '../src/currencies/index.json';


export default function I18nInput() {
    return (
        <>
            <LanguageSelect />
            <CurrencySelect />
        </>
    )
}

interface LanguageSelectItemProps extends React.ComponentPropsWithoutRef<'div'> {
    value: string;
    label: string;
    subLabel: string;
}

const LanguageSelectItem = forwardRef<HTMLDivElement, LanguageSelectItemProps>(
    ({ value, label, subLabel, ...others }: LanguageSelectItemProps, ref) => {

        return (
            <div ref={ref} key={value} style={{ cursor: "pointer" }} {...others}>
                <Group noWrap>
                    <div>
                        <Text size="md">{label}</Text>
                        <Text size="xs" opacity={0.65}>
                            <Trans>{subLabel}</Trans>
                        </Text>
                    </div>
                </Group>
            </div>
        )
    }
);

function LanguageSelect() {
    const router: NextRouter = useRouter();

    const handleSelect = (code: string) => {
        if (code !== router.locale) {
            router.push(router.asPath, undefined, { locale: code });
        }
    }

    const dataItems = langItems.map(langItem => {
        return {
            value: langItem.code,
            label: langItem.native,
            subLabel: langItem.region
        }
    })

    return (
        <Select
            label={t`Choose Language`}
            itemComponent={LanguageSelectItem}
            data={dataItems}
            defaultValue={router.locale}
            searchable
            onChange={handleSelect}
            maxDropdownHeight={400}
            nothingFound={t`No matches`}
            filter={(value, item) => {
                const token = `${item.value}-${item.label}-${item.subLabel}`;
                return token.toLowerCase().includes(value.toLowerCase().trim());
            }}
        />
    );
}

interface CurrencySelectItemProps extends React.ComponentPropsWithoutRef<'div'> {
    value: string;
    label: string;
}

const CurrencySelectItem = forwardRef<HTMLDivElement, CurrencySelectItemProps>(
    ({ value, label, ...others }: LanguageSelectItemProps, ref) => {

        return (
            <div ref={ref} key={value} style={{ cursor: "pointer" }} {...others}>
                <Group noWrap>
                    <div>
                        <Text size="md">{label}</Text>
                        <Text size="xs" opacity={0.65}>
                            {`(${value})`}
                        </Text>
                    </div>
                </Group>
            </div>
        )
    }
);

function CurrencySelect() {
    const { isFetching, currencyData, isError, selectedCurrency, setSelectedCurrency } = useFiatRates(false);

    const handleSelect = (currencySymbol: string) => {
        if (selectedCurrency !== currencySymbol) setSelectedCurrency(currencySymbol);
    }

    const dataItems = isFetching ? [] : Object.keys(currencyData).map(currencySymbol => {
        return {
            value: currencySymbol,
            label: currencies.find(currencyItem => currencyItem.code === currencySymbol)?.description
        }
    })

    return (
        <Select
            label={t`Choose Currency`}
            itemComponent={LanguageSelectItem}
            data={dataItems}
            defaultValue={selectedCurrency}
            searchable
            onChange={handleSelect}
            maxDropdownHeight={400}
            nothingFound={t`No matches`}
            filter={(value, item) => {
                const token = `${item.value}-${item.label}`;
                return token.toLowerCase().includes(value.toLowerCase().trim());
            }}
        />
    );
}