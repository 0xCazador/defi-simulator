/**
 * JSON-LD for the indexable routes.
 *
 * One @graph per page rather than several stray scripts, so the entities can
 * reference each other by @id (the app and the FAQ both hang off the same
 * Organization). Every human-readable value comes from the locale-resolved
 * SeoContent, which keeps the markup consistent with the visible copy — a
 * requirement for FAQPage, where mismatched answers are a manual-action risk.
 *
 * Deliberately absent: aggregateRating and review. There are no ratings to
 * report and inventing them violates Google's structured data policies.
 */
import {
  DEFAULT_LOCALE,
  IndexableRoute,
  canonicalUrl,
  getCanonicalOrigin,
} from "./seo";
import type { SeoContent } from "./seoContent";

const SAME_AS = [
  "https://twitter.com/defisim",
  "https://github.com/0xcazador/defi-simulator",
  "https://discord.gg/VF64xjhXEs",
];

export const buildStructuredData = (
  route: IndexableRoute,
  locale: string,
  content: SeoContent,
): object => {
  const origin = getCanonicalOrigin();
  const canonical = canonicalUrl(route, locale);
  const organizationId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;

  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "DeFi Simulator",
      url: origin,
      sameAs: SAME_AS,
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: origin,
      name: "DeFi Simulator",
      publisher: { "@id": organizationId },
      inLanguage: locale,
    },
    {
      "@type": "WebApplication",
      "@id": `${canonical}#app`,
      name: content.h1,
      description: content.metaDescription,
      url: canonical,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      inLanguage: locale,
      isPartOf: { "@id": websiteId },
      publisher: { "@id": organizationId },
    },
    {
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      inLanguage: locale,
      isPartOf: { "@id": websiteId },
      mainEntity: content.faq.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    },
  ];

  // The simulator is the site root, so it has no breadcrumb trail of its own.
  if (route !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumbs`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "DeFi Simulator",
          item: canonicalUrl("/", locale),
        },
        { "@type": "ListItem", position: 2, name: content.h1, item: canonical },
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
};

/**
 * Serialize for inlining in a <script> tag. Escaping "<" is what stops a
 * "</script>" sequence inside any translated string from closing the tag early.
 */
export const serializeStructuredData = (data: object): string =>
  JSON.stringify(data).replace(/</g, "\\u003c");

export const structuredDataForRoute = (
  route: IndexableRoute,
  locale: string | undefined,
  content: SeoContent,
): string =>
  serializeStructuredData(
    buildStructuredData(route, locale ?? DEFAULT_LOCALE, content),
  );
