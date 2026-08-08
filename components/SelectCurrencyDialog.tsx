import * as React from "react";
import { t, Trans } from "@lingui/macro";

import {
  Button,
  Modal,
  List,
  TextInput,
  Tooltip,
  ActionIcon,
  Text,
  Center,
  UnstyledButton,
} from "@mantine/core";
import { RxReset } from "react-icons/rx";

import { NextRouter, useRouter } from "next/router";
import flagsJson from "../src/currencies/emoji.json";
import currencyItems from "../src/currencies/index.json";

import { useFiatRates } from "../hooks/useFiatData";

const flags: Record<string, string> = flagsJson;

type Currency = {
  code: string;
  description: string;
};

export default function SelectCurrencyDialog() {
  const { isFetching, currencyData, selectedCurrency, setSelectedCurrency } =
    useFiatRates(true);
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const router: NextRouter = useRouter();
  const selectedCurrencyData = currencyItems.find(
    (curr) => curr.code === selectedCurrency
  );
  const selectedFlag = flags[selectedCurrency];

  const handleClose = () => {
    setSearchText("");
    setOpen(false);
  };

  const handleSelectCurrency = (code: string) => {
    setSelectedCurrency(code);
    handleClose();
  };

  let currencies: Currency[] = isFetching
    ? []
    : currencyItems.filter((item) => currencyData[item.code]);

  currencies = open
    ? new Array(...currencies).filter((currency) => {
        // filter currency by search text, if there is any
        if (!searchText.length) return true;
        const { code, description } = currency as Currency;
        const token = `${code}-${description};`;
        if (token.toUpperCase().includes(searchText.toUpperCase())) return true;
        return false;
      })
    : new Array(...currencyItems);

  return (
    <>
      <Modal
        size="lg"
        opened={open}
        onClose={() => {
          setSearchText("");
          setOpen(false);
        }}
        title={t`Select Currency`}
      >
        <TextInput
          value={searchText}
          label={t`Search for available currencies`}
          onChange={(e) => setSearchText(e.target.value)}
          size="md"
          mb={8}
          style={{}}
          inputWrapperOrder={["label", "error", "input", "description"]}
          rightSection={
            searchText?.length > 0 && (
              <Tooltip
                label={t`Reset search query`}
                position="top-end"
                withArrow
              >
                <ActionIcon
                  aria-label={t`Reset search query`}
                  onClick={() => setSearchText("")}
                >
                  <RxReset size={18} style={{ display: "block" }} />
                </ActionIcon>
              </Tooltip>
            )
          }
        />

        {currencies.length === 0 ? (
          <Center>
            <Text mt={15} mb={15}>
              <Trans>
                There are no currencies available that match the search query.
                Reset the search query to select a currency.
              </Trans>
            </Text>
          </Center>
        ) : (
          <Text mb={8}>
            {t`Select ${currencies.length === 1 ? "the" : "one of the"} (${
              currencies.length
            }) ${
              currencies.length === 1 ? "currency" : "currencies"
            } below. After selecting a currency the app will display asset prices, liquidation scenario, and position summary in the selected currency.`}
          </Text>
        )}

        <List listStyleType="none">
          {currencies.map((currency: Currency) => {
            const flag = flags[currency.code];

            return (
              <List.Item key={currency.code} m={5}>
                <UnstyledButton
                  onClick={() => handleSelectCurrency(currency.code)}
                  style={{
                    cursor: "pointer",
                    font: "inherit",
                    color: "inherit",
                  }}
                >
                  {`${currency.code.toLocaleUpperCase(
                    router.locale
                  )} - ${currency.description.toLocaleUpperCase(
                    router.locale
                  )}  ${flag ?? ""}`}
                </UnstyledButton>
              </List.Item>
            );
          })}
        </List>
      </Modal>

      <Button size="compact-sm" variant="light" onClick={() => setOpen(true)}>
        {`${selectedCurrencyData?.code.toLocaleUpperCase(router.locale)}  ${
          selectedFlag ?? ""
        }`}
      </Button>
    </>
  );
}
