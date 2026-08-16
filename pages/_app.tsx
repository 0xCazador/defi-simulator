import { AppProps } from "next/app";
import Head from "next/head";
import Script from "next/script";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { t } from "@lingui/core/macro";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

// Styles specific to noUI slider
import "nouislider/dist/nouislider.css";
import "../css/slider.css";
import "../css/global.css";

import { theme } from "../theme";
import languages from "../src/languages/index.json";
import "../utils/i18n";
import PageShell from "../components/PageShell";

export default function App(props: AppProps) {
  const { Component, pageProps } = props;

  return (
    <>
      <Head>
        <title>DeFi Simulator</title>
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
        <meta
          name="description"
          content={t`DeFi Simulator is an unofficial, open source, community-built Aave debt simulator and liquidation calculator.`}
        />
        <link rel="shortcut icon" href="/favicon.ico" />
        {languages.map((language) => (
          <link
            key={language.code}
            rel="alternate"
            hrefLang={language.code}
            href={`https://defisim.xyz/${language.code}`}
          />
        ))}
      </Head>
      {process.env.NODE_ENV === "production" && (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "42f927fda7404332a3720866ad63795f"}'
        />
      )}
      <I18nProvider i18n={i18n}>
        <MantineProvider theme={theme} forceColorScheme="dark">
          <PageShell />
          <Component {...pageProps} />
          <Notifications />
        </MantineProvider>
      </I18nProvider>
    </>
  );
}
