import * as React from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

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
import { MdLanguage } from "react-icons/md";

import { NextRouter, useRouter } from "next/router";
import languages from "../src/languages/index.json";

type Language = {
  code: string;
  name: string;
  region: string;
  native: string;
};

export default function SelectLanguageDialog() {
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const router: NextRouter = useRouter();
  const activeLanguage = languages.find((lang) => lang.code === router.locale);

  const handleClose = () => {
    setSearchText("");
    setOpen(false);
  };

  const handleSelectLanguage = (code: string) => {
    if (code !== router.locale) {
      router.push(router.asPath, undefined, { locale: code });
    }
    handleClose();
  };

  const langs: Language[] = open
    ? new Array(...languages).filter((language: Language) => {
        // filter lang by search text, if there is any
        if (!searchText.length) return true;
        const { code, name, region, native } = language;
        const token = `${code}-${name}-${region}-${native};`;
        if (token.toUpperCase().includes(searchText.toUpperCase())) return true;
        return false;
      })
    : new Array(...languages);

  return (
    <>
      <Modal
        opened={open}
        onClose={() => {
          setSearchText("");
          setOpen(false);
        }}
        title={t`Select Language`}
      >
        <TextInput
          value={searchText}
          label={t`Search for available languages`}
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

        {langs.length === 0 ? (
          <Center>
            <Text mt={15} mb={15}>
              <Trans>
                There are no languages available that match the search query.
                Reset the search query to select a language.
              </Trans>
            </Text>
          </Center>
        ) : (
          <Text mb={8}>
            {t`Select ${langs.length === 1 ? "the" : "one of the"} (${
              langs.length
            }) ${
              langs.length === 1 ? "language" : "languages"
            } below to translate the app.`}
          </Text>
        )}

        <List listStyleType="none">
          {langs.map((language: Language) => (
            <List.Item key={language.code} m={5}>
              <UnstyledButton
                onClick={() => handleSelectLanguage(language.code)}
                style={{ cursor: "pointer", font: "inherit", color: "inherit" }}
              >
                {`${language.native.toLocaleUpperCase(router.locale)}`}
              </UnstyledButton>
            </List.Item>
          ))}
        </List>
      </Modal>

      <Button
        size="compact-sm"
        variant="light"
        onClick={() => setOpen(true)}
        mr="sm"
      >
        <MdLanguage style={{ marginRight: "5px" }} />
        {activeLanguage?.native.toLocaleUpperCase(router.locale)}
      </Button>
    </>
  );
}
