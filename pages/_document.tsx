import { DocumentProps, Head, Html, Main, NextScript } from "next/document";
import { ColorSchemeScript } from "@mantine/core";

export default function Document(props: DocumentProps) {
  return (
    <Html lang={props.locale || "en"}>
      <Head>
        <ColorSchemeScript forceColorScheme="dark" />
        {/*
          next/font requires SWC and this project compiles with Babel (Lingui
          macros + top-level await), so the @font-face rules are generated
          instead — see scripts/fetchFonts.mjs and css/fonts.css, imported in
          _app. That replaced a render-blocking stylesheet on
          fonts.googleapis.com, which put a third-party DNS lookup, TLS
          handshake and redirect in front of first paint.

          Only the Latin Inter subset is preloaded. It is the one file every
          locale needs — asset tickers, amounts and percentages are Latin
          whatever the UI language — whereas preloading a heading or
          non-Latin subset would be dead weight for most visitors.
        */}
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
