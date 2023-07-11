import { forwardRef } from 'react';
import { Group, Avatar, Text, Select } from '@mantine/core';
import { t, Trans } from "@lingui/macro";

import langItems from "../src/languages/index.json";
import { NextRouter, useRouter } from 'next/router';


interface SelectItemProps extends React.ComponentPropsWithoutRef<'div'> {
    value: string;
    label: string;
    subLabel: string;
}

const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
    ({ value, label, subLabel, ...others }: SelectItemProps, ref) => {

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

export default function I18nInput() {
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
            itemComponent={SelectItem}
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