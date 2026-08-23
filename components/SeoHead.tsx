/**
 * Canonical, hreflang and indexing directives for the app's indexable routes.
 *
 * Replaces the alternate-link block that used to live in _app: that one pointed
 * every locale at the site root on every route, so /interest advertised the
 * homepage as its German translation and the noindex share pages carried a full
 * alternate set. Alternates are derived per route here, and a page can only
 * emit them by naming a route in INDEXABLE_ROUTES.
 *
 * Title and description arrive as pre-resolved strings rather than t`` macros
 * because these tags have to be correct in the prerendered HTML, before the
 * client effect that activates the locale has run. See utils/seoContent.
 */
import Head from "next/head";
import { useRouter } from "next/router";

import {
  DEFAULT_LOCALE,
  IndexableRoute,
  alternateLinks,
  canonicalUrl,
} from "../utils/seo";
import type { SeoContent } from "../utils/seoContent";
import { structuredDataForRoute } from "../utils/structuredData";

type SeoHeadProps = {
  route: IndexableRoute;
  content: SeoContent;
};

export default function SeoHead({ route, content }: SeoHeadProps) {
  const router = useRouter();
  const locale = router.locale ?? DEFAULT_LOCALE;
  const canonical = canonicalUrl(route, locale);
  const alternates = alternateLinks(route);
  const title = content.metaTitle;
  const description = content.metaDescription;

  return (
    <Head>
      <title>{title}</title>
      <meta key="description" name="description" content={description} />
      {/* max-image-preview:large opts the OG card into large thumbnails in
          search results and Discover. */}
      <meta
        key="robots"
        name="robots"
        content="index,follow,max-image-preview:large"
      />
      {/* Query-free: ?address=, ?market= and ?currency= are app state, not
          distinct documents, so every permutation folds into this URL. */}
      <link rel="canonical" href={canonical} />
      <meta key="og:title" property="og:title" content={title} />
      <meta
        key="og:description"
        property="og:description"
        content={description}
      />
      <meta key="og:url" property="og:url" content={canonical} />
      <meta key="og:locale" property="og:locale" content={locale} />
      {alternates
        .filter(
          (alternate) =>
            alternate.hrefLang !== locale && alternate.hrefLang !== "x-default",
        )
        .map((alternate) => (
          <meta
            key={`og:locale:alternate:${alternate.hrefLang}`}
            property="og:locale:alternate"
            content={alternate.hrefLang}
          />
        ))}
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta
        key="twitter:description"
        name="twitter:description"
        content={description}
      />
      {alternates.map((alternate) => (
        <link
          key={`alternate:${alternate.hrefLang}`}
          rel="alternate"
          hrefLang={alternate.hrefLang}
          href={alternate.href}
        />
      ))}
      {/* Every string in here is also visible on the page, which FAQPage
          requires. */}
      <script
        key="ld+json"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: structuredDataForRoute(route, router.locale, content),
        }}
      />
    </Head>
  );
}
