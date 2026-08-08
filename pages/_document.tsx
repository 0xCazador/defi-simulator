import { DocumentProps, Head, Html, Main, NextScript } from "next/document";
import { ColorSchemeScript } from "@mantine/core";

export default function Document(props: DocumentProps) {
  return (
    <Html lang={props.locale || "en"}>
      <Head>
        <ColorSchemeScript forceColorScheme="dark" />
        {/* next/font requires SWC, but this project compiles with Babel
            (Lingui macros + top-level await), so fonts load via Google. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
