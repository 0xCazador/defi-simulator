/**
 * Simulator route. The interactive chrome and views live in PageShell; this
 * module owns the indexable half — locale-resolved copy for the meta tags and
 * <h1> (consumed by PageShell via the `seo` prop) plus the crawlable content
 * sections rendered below the app.
 */
import type { GetStaticProps } from "next";

import SeoSections from "../components/SeoSections";
import { getMarketSnapshot, MarketSnapshot } from "../utils/marketSnapshot";
import { REVALIDATE_SECONDS } from "../utils/seo";
import { loadServerI18n } from "../utils/serverI18n";
import { SeoContent, getSeoContent } from "../utils/seoContent";

type HomePageProps = {
  seo: SeoContent;
  snapshot: MarketSnapshot | null;
};

export const getStaticProps: GetStaticProps<HomePageProps> = async (ctx) => {
  const i18n = await loadServerI18n(ctx.locale);
  return {
    props: {
      seo: getSeoContent("/", i18n),
      snapshot: await getMarketSnapshot(),
    },
    revalidate: REVALIDATE_SECONDS,
  };
};

export default function HomePage({ seo, snapshot }: HomePageProps) {
  return <SeoSections route="/" content={seo} snapshot={snapshot} />;
}
