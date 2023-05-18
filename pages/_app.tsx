import { AppProps } from 'next/app';
import Head from 'next/head';
import {
  MantineProvider,
  ColorScheme,
  MantineThemeOverride,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';

// Styles specific to noUI slider
import 'nouislider/dist/nouislider.css';
import "../css/slider.css";

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

      <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
        <Component {...pageProps} />
        <Notifications />
      </MantineProvider>

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
