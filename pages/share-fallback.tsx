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
import { getSiteUrl, OG_TEMPLATE_VERSION } from "../utils/shareCard";
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

  const imageParams = new URLSearchParams({ tv: String(OG_TEMPLATE_VERSION) });
  if (safeAddress) imageParams.set("a", safeAddress);
  if (locale !== "en") imageParams.set("locale", locale);

  const canonicalParams = new URLSearchParams();
  if (safeAddress) canonicalParams.set("address", safeAddress);
  if (market) canonicalParams.set("market", market.id);
  const localePrefix = locale !== "en" ? `/${locale}` : "";
  const canonicalPath = `${localePrefix}${from === "/" ? "" : from}`;

  ctx.res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );

  return {
    props: {
      meta: {
        title,
        description,
        imageUrl: `${getSiteUrl()}/api/og?${imageParams.toString()}`,
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
