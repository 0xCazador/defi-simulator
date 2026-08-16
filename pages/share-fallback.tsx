/**
 * Crawler-only SSR route (see middleware.ts): emits address-aware OG meta
 * for pasted app URLs like /?address=stani.eth with zero RPC. Humans never
 * land here — the middleware only rewrites crawler user-agents — but if one
 * does (e.g. a crawler-spoofing browser), the page immediately links back
 * to the real app.
 */
import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Button, Center, Container, Text } from "@mantine/core";
import { Trans } from "@lingui/react/macro";

import { t } from "@lingui/core/macro";

import { markets } from "../hooks/useAaveData";
import { getOgImageUrlForAddress, getSiteUrl } from "../utils/shareCard";
import { loadServerI18n } from "../utils/serverI18n";

type ShareFallbackProps = {
  meta: {
    title: string;
    description: string;
    imageUrl: string;
    canonicalUrl: string;
  };
  appHref: string;
};

const firstString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const getServerSideProps: GetServerSideProps<
  ShareFallbackProps
> = async (ctx) => {
  const address = (firstString(ctx.query.address) ?? "").trim().slice(0, 60);
  const marketId = firstString(ctx.query.market);
  const from = firstString(ctx.query.from) === "/interest" ? "/interest" : "/";
  const locale = ctx.locale ?? "en";
  const i18n = await loadServerI18n(locale);

  const market = markets.find((m) => m.id === marketId);
  const marketTitle = market?.title;

  const safeAddress = /^[\w.\-]+$/.test(address) ? address : "";
  const title = safeAddress
    ? `${safeAddress} — DeFi Simulator`
    : "DeFi Simulator";
  const description = marketTitle
    ? t(
        i18n,
      )`Simulate this Aave position on ${marketTitle}: health factor, liquidation scenarios, and on-chain interest.`
    : t(
        i18n,
      )`Simulate this Aave position: health factor, liquidation scenarios, and on-chain interest.`;

  const canonicalParams = new URLSearchParams();
  if (safeAddress) canonicalParams.set("address", safeAddress);
  if (market) canonicalParams.set("market", market.id);
  const localePrefix = locale !== "en" ? `/${locale}` : "";
  const canonicalPath = `${localePrefix}${from === "/" ? "" : from}`;

  // Never publicly cache this response: it's served under the rewritten
  // app URL (`/` or `/interest`) and Netlify's edge cache key ignores the
  // ?address= query param — a public entry here would poison the homepage
  // for regular visitors. The render is zero-RPC, so recomputing is cheap.
  ctx.res.setHeader("Cache-Control", "private, no-store");

  return {
    props: {
      meta: {
        title,
        description,
        imageUrl: safeAddress
          ? getOgImageUrlForAddress(safeAddress, locale)
          : `${getSiteUrl()}/api/og`,
        canonicalUrl: `${getSiteUrl()}${canonicalPath}/?${canonicalParams.toString()}`,
      },
      appHref: `${from}?${canonicalParams.toString()}`,
    },
  };
};

export default function ShareFallbackPage({
  meta,
  appHref,
}: ShareFallbackProps) {
  return (
    <Container px="xs">
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        {/* Crawler-only surface; the canonical content lives on the app URL */}
        <meta name="robots" content="noindex" />
        {/* Keys match _app's defaults so these address-aware tags replace them */}
        <meta key="og:title" property="og:title" content={meta.title} />
        <meta
          key="og:description"
          property="og:description"
          content={meta.description}
        />
        <meta key="og:image" property="og:image" content={meta.imageUrl} />
        <meta key="og:url" property="og:url" content={meta.canonicalUrl} />
        <meta key="og:type" property="og:type" content="website" />
        <meta
          key="og:site_name"
          property="og:site_name"
          content="DeFi Simulator"
        />
        <meta
          key="twitter:card"
          name="twitter:card"
          content="summary_large_image"
        />
        <meta key="twitter:title" name="twitter:title" content={meta.title} />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={meta.description}
        />
        <meta
          key="twitter:image"
          name="twitter:image"
          content={meta.imageUrl}
        />
      </Head>
      <Center mt={60} style={{ flexDirection: "column", gap: 16 }}>
        <Text fz="lg" ta="center">
          <Trans>This link opens the DeFi Simulator app.</Trans>
        </Text>
        <Button component={Link} href={appHref}>
          <Trans>Open Simulator</Trans>
        </Button>
      </Center>
    </Container>
  );
}
