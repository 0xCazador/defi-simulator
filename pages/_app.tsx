import { AppProps } from 'next/app';
import Head from 'next/head';
import {
  MantineProvider,
  ColorScheme,
  MantineThemeOverride,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { messages } from '../src/locales/en/messages'

// Styles specific to noUI slider
import 'nouislider/dist/nouislider.css';
import "../css/slider.css";

i18n.load('en', messages)
i18n.activate('en')

export default function App(props: AppProps & { colorScheme: ColorScheme }) {
  const { Component, pageProps } = props;

  return (
    <>
      <Head>
        <title>DeFi Simulator</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
        <meta name="description" content="DeFi Simulator is an unofficial, open source, community-built Aave debt simulator." />
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "42f927fda7404332a3720866ad63795f"}'
        />
        <link rel="shortcut icon" href="/favicon.ico" />
      </Head>
      <I18nProvider i18n={i18n}>
        <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
          <Component {...pageProps} />
          <Notifications />
        </MantineProvider>
      </I18nProvider>
    </>
  );
}

const theme: MantineThemeOverride = {
  colorScheme: 'dark',
  breakpoints: {
    xs: '0',
    sm: '576',
    md: '768',
    lg: '992',
    xl: '1200',
  },
};
