/**
 * Share landing page: /s/{id} (or /s/inline?card=… when the blob store was
 * unavailable at mint time).
 *
 * Crawlers get localized OG meta rendered server-side from the stored
 * snapshot — no RPC, no client JS. Humans get the real app: the snapshot's
 * address and market are seeded into the store, the live position is
 * fetched, any shared simulator edits are replayed, and a status banner
 * explains how faithfully the shared state was reproduced.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { Alert, Button, Center, Container, Text } from "@mantine/core";
import { ethers } from "ethers";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react";
import { FiAlertTriangle, FiCheckCircle, FiClock } from "react-icons/fi";

import AppBar from "../../components/AppBar";
import AddressInput, { isValidENSAddress } from "../../components/AddressInput";
import AddressCard from "../../components/AddressCard";
import InterestManifest from "../../components/InterestManifest";
import ViewTabs from "../../components/ViewTabs";
import Footer from "../../components/Footer";
import { markets, useAaveData } from "../../hooks/useAaveData";
import { activateLocale } from "../../utils/i18n";
import {
  LiveState,
  ReplayResult,
  ReproductionStatus,
  SharePayload,
  decodeInlinePayload,
  fmtHf,
  getOgImageUrl,
  getOgImageUrlInline,
  getShareDescription,
  getShareTitle,
  getShareUrl,
  getShareUrlInline,
  getSiteUrl,
  checkReproduction,
} from "../../utils/shareCard";
import { getShare, isValidShareId } from "../../utils/shareStore";
import { loadServerI18n } from "../../utils/serverI18n";

type SharePageProps = {
  payload: SharePayload | null;
  meta: {
    title: string;
    description: string;
    imageUrl: string;
    url: string;
  };
};

const firstString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const getServerSideProps: GetServerSideProps<SharePageProps> = async (
  ctx,
) => {
  const id = firstString(ctx.params?.id as string | string[]);
  const inline = firstString(ctx.query.card);
  const locale = ctx.locale ?? "en";

  let payload: SharePayload | null = null;
  let shareId: string | null = null;
  if (isValidShareId(id)) {
    payload = await getShare(id);
    if (payload) shareId = id!;
  } else if (id === "inline" && inline) {
    payload = decodeInlinePayload(inline);
  }

  const i18n = await loadServerI18n(locale);

  // Snapshots are immutable, so minted /s/{id} pages cache aggressively at
  // the CDN — the id is in the path, which is the cache key. Inline shares
  // (/s/inline?card=…) must NOT be publicly cached: Netlify's edge ignores
  // custom query params in its cache key, so one inline share would be
  // served for all of them. Same for misses, which shouldn't stick for a day.
  if (shareId) {
    ctx.res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800",
    );
  } else {
    ctx.res.setHeader("Cache-Control", "private, no-store");
  }

  if (!payload) {
    return {
      props: {
        payload: null,
        meta: {
          title: "DeFi Simulator",
          description: t(
            i18n,
          )`Simulate Aave positions, liquidation scenarios, and on-chain interest.`,
          imageUrl: `${getSiteUrl()}/api/og`,
          url: getSiteUrl(),
        },
      },
    };
  }

  const meta = {
    title: getShareTitle(payload.card, i18n),
    description: getShareDescription(payload.card, i18n),
    imageUrl: shareId
      ? getOgImageUrl(shareId, locale)
      : getOgImageUrlInline(payload.card, locale),
    url: shareId
      ? getShareUrl(shareId, locale)
      : getShareUrlInline(inline!, locale),
  };

  return { props: { payload, meta } };
};

export default function SharePage({ payload, meta }: SharePageProps) {
  const router = useRouter();

  useEffect(() => {
    if (router.locale) activateLocale(router.locale);
  }, [router.locale]);

  return (
    <>
      <Head>
        <title>{`${meta.title} · DeFi Simulator`}</title>
        <meta name="description" content={meta.description} />
        {/* Snapshot pages shouldn't compete with the app in search results */}
        <meta name="robots" content="noindex" />
        {/* Keys match _app's defaults so these snapshot tags replace them */}
        <meta key="og:title" property="og:title" content={meta.title} />
        <meta
          key="og:description"
          property="og:description"
          content={meta.description}
        />
        <meta key="og:image" property="og:image" content={meta.imageUrl} />
        <meta key="og:image:width" property="og:image:width" content="1200" />
        <meta key="og:image:height" property="og:image:height" content="630" />
        <meta key="og:url" property="og:url" content={meta.url} />
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
      <Container px="xs" style={{ contain: "paint" }}>
        <AppBar />
        {payload ? (
          <SharedSnapshotView payload={payload} />
        ) : (
          <UnavailableShare />
        )}
        <Footer />
      </Container>
    </>
  );
}

const UnavailableShare = () => (
  <Center mt={60} style={{ flexDirection: "column", gap: 16 }}>
    <Text fz="lg" ta="center" maw={520}>
      <Trans>
        This shared link is no longer available or couldn&apos;t be read. You
        can still explore any position in the simulator.
      </Trans>
    </Text>
    <Button component={Link} href="/">
      <Trans>Open Simulator</Trans>
    </Button>
  </Center>
);

const EMPTY_REPLAY: ReplayResult = {
  applied: 0,
  skipped: 0,
  skippedSymbols: [],
};

const SharedSnapshotView = ({ payload }: { payload: SharePayload }) => {
  const router = useRouter();
  const { card } = payload;
  const isValidAddress =
    ethers.utils.isAddress(card.a) || isValidENSAddress(card.a);
  const {
    addressData,
    currentAddress,
    currentMarket,
    setCurrentAddress,
    setCurrentMarket,
    applySimSnapshot,
  } = useAaveData(isValidAddress ? card.a : "");

  const marketExists = markets.some((market) => market.id === card.m);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const replayStarted = useRef(false);

  // Seed the snapshot's address + market, and surface them in the query so
  // tab navigation into the main app keeps the address loaded.
  useEffect(() => {
    if (isValidAddress && currentAddress !== card.a) setCurrentAddress(card.a);
    if (marketExists && currentMarket !== card.m) setCurrentMarket(card.m);
    router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, address: card.a, market: card.m },
      },
      undefined,
      { shallow: true },
    );
    // Run once on mount: the snapshot fully determines the seed state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marketData = addressData?.[card.m];

  // Replay shared simulator edits once the snapshot market finishes loading.
  useEffect(() => {
    if (replayStarted.current || !marketExists) return;
    if (currentMarket !== card.m) return;
    if (!marketData?.lastFetched || marketData?.isFetching) return;
    replayStarted.current = true;
    if (payload.simOps?.length) {
      setReplay(applySimSnapshot(payload.simOps));
    } else {
      setReplay(EMPTY_REPLAY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    marketExists,
    currentMarket,
    marketData?.lastFetched,
    marketData?.isFetching,
  ]);

  const status: ReproductionStatus | null = useMemo(() => {
    if (card.k === "interest") return null;
    if (!marketExists) {
      return { status: "not-reproducible", reason: "market-gone" };
    }
    if (!replay) return null;
    const fetched = marketData?.fetchedData;
    const working = marketData?.workingData;
    const live: LiveState = {
      healthFactor: working?.healthFactor ?? -1,
      reserves:
        working?.userReservesData?.map((item) => ({
          symbol: item.asset.symbol,
          quantity: item.underlyingBalance,
          priceInUSD: item.asset.priceInUSD,
        })) ?? [],
      borrows:
        working?.userBorrowsData?.map((item) => ({
          symbol: item.asset.symbol,
          quantity: item.totalBorrows,
          priceInUSD: item.asset.priceInUSD,
        })) ?? [],
      marketExists,
      fetchedReserves:
        fetched?.userReservesData?.map((item) => ({
          symbol: item.asset.symbol,
          quantity: item.underlyingBalance,
        })) ?? [],
      fetchedBorrows:
        fetched?.userBorrowsData?.map((item) => ({
          symbol: item.asset.symbol,
          quantity: item.totalBorrows,
        })) ?? [],
    };
    return checkReproduction(payload.expect, live, replay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, marketExists]);

  return (
    <>
      <AddressInput />
      <ViewTabs />
      <ShareStatusBanner payload={payload} status={status} replay={replay} />
      {card.k === "interest" ? <InterestManifest /> : <AddressCard />}
    </>
  );
};

const ShareStatusBanner = ({
  payload,
  status,
  replay,
}: {
  payload: SharePayload;
  status: ReproductionStatus | null;
  replay: ReplayResult | null;
}) => {
  const { i18n } = useLingui();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { card } = payload;
  const snapshotDate = new Intl.DateTimeFormat(i18n.locale, {
    dateStyle: "medium",
  }).format(new Date(card.asOf * 1000));

  const shared = <Trans>Shared snapshot from {snapshotDate}.</Trans>;

  // Interest shares are read-only history: the live manifest below simply
  // recomputes from chain events, so no reproduction check applies.
  if (card.k === "interest") {
    return (
      <Alert
        mb="md"
        color="blue"
        icon={<FiClock size="1rem" />}
        withCloseButton
        onClose={() => setDismissed(true)}
        closeButtonLabel={t`Dismiss`}
      >
        {shared}{" "}
        <Trans>The interest accounting below is computed live on-chain.</Trans>
      </Alert>
    );
  }

  if (!status) {
    return (
      <Alert mb="md" color="gray" icon={<FiClock size="1rem" />}>
        {shared} <Trans>Loading the live position…</Trans>
      </Alert>
    );
  }

  if (status.status === "not-reproducible") {
    return (
      <Alert
        mb="md"
        color="red"
        icon={<FiAlertTriangle size="1rem" />}
        title={<Trans>This shared state can&apos;t be reproduced</Trans>}
        withCloseButton
        onClose={() => setDismissed(true)}
        closeButtonLabel={t`Dismiss`}
      >
        {shared}{" "}
        {status.reason === "market-gone" ? (
          <Trans>
            The market in this share ({card.mt}) is no longer available in the
            app.
          </Trans>
        ) : (
          <Trans>
            This position is no longer active on-chain, so the live view
            can&apos;t match the shared card.
          </Trans>
        )}
      </Alert>
    );
  }

  if (status.status === "diverged") {
    return (
      <Alert
        mb="md"
        color="yellow"
        icon={<FiAlertTriangle size="1rem" />}
        title={<Trans>The live state differs from this share</Trans>}
        withCloseButton
        onClose={() => setDismissed(true)}
        closeButtonLabel={t`Dismiss`}
      >
        {shared}{" "}
        {status.causes.map((cause, index) => {
          const spacer = index > 0 ? " " : "";
          if (cause.kind === "position-changed") {
            return (
              <span key="position-changed">
                {spacer}
                <Trans>
                  The on-chain position has changed since this was shared.
                </Trans>
              </span>
            );
          }
          if (cause.kind === "edits-skipped") {
            return (
              <span key="edits-skipped">
                {spacer}
                <Trans>
                  {cause.count} shared edits couldn&apos;t be applied (
                  {cause.symbols.join(", ")}) — those assets are no longer
                  listed in this market.
                </Trans>
              </span>
            );
          }
          return (
            <span key="conditions-moved">
              {spacer}
              <Trans>
                Market conditions have moved: the health factor is now{" "}
                {fmtHf(cause.liveHf)} (the share showed{" "}
                {fmtHf(cause.expectedHf)}).
              </Trans>
            </span>
          );
        })}
      </Alert>
    );
  }

  const appliedEdits = replay?.applied ?? 0;
  return (
    <Alert
      mb="md"
      color="teal"
      icon={<FiCheckCircle size="1rem" />}
      withCloseButton
      onClose={() => setDismissed(true)}
      closeButtonLabel={t`Dismiss`}
    >
      {shared}{" "}
      {"sim" in card && card.sim && appliedEdits > 0 ? (
        <Trans>
          The shared simulation was restored ({appliedEdits} edits applied) —
          adjust anything below to keep exploring.
        </Trans>
      ) : (
        <Trans>You&apos;re viewing the live position — it still matches.</Trans>
      )}
    </Alert>
  );
};
