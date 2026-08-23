/**
 * Canonical URL + hreflang vocabulary for the indexable surface.
 *
 * Every indexable page is statically prerendered once per locale, so the
 * canonical/alternate set is fully derivable from (route, locale) — no request
 * context needed. Keeping that derivation here means the sitemap and the
 * in-page <link> tags can never disagree, which is the whole point of hreflang
 * (Google discards non-reciprocal annotations).
 */
import languages from "../src/languages/index.json";

export const DEFAULT_LOCALE = "en";

/** Locale list comes from the language picker's catalog rather than
 * lingui.config.js: that config carries the TranslationIO API key, which has
 * no business in a client bundle. The two lists are asserted equal in tests. */
export const LOCALES: string[] = languages.map((language) => language.code);

/** Routes that should be indexed. Share routes (/s/[id], /share-fallback) are
 * deliberately absent — they're noindex, per-snapshot surfaces. */
export const INDEXABLE_ROUTES = ["/", "/interest"] as const;

export type IndexableRoute = (typeof INDEXABLE_ROUTES)[number];

/** ISR window for the indexable routes, in seconds. Matches the market
 * snapshot's cache TTL, so a regenerating page normally finds a warm snapshot
 * and only the first one past the window pays for a refetch. */
export const REVALIDATE_SECONDS = 6 * 60 * 60;

export const isIndexableRoute = (path: string): path is IndexableRoute =>
  (INDEXABLE_ROUTES as readonly string[]).includes(path);

/**
 * The production origin, always — never the current window origin.
 *
 * Canonicals and hreflang must resolve to the same string on the server and in
 * the browser (hydration) and must not point at a deploy preview or localhost,
 * which is why this deliberately does not reuse getSiteUrl() from shareCard.
 */
export const getCanonicalOrigin = (): string =>
  (process.env.NEXT_PUBLIC_SITE_URL || "https://defisim.xyz").replace(
    /\/$/,
    "",
  );

/**
 * Path for a route under a locale. English lives at the unprefixed path
 * (Next's defaultLocale is not prefixed); every other locale is prefixed.
 */
export const localizedPath = (route: string, locale: string): string => {
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  if (route === "/") return prefix || "/";
  return `${prefix}${route}`;
};

/** Absolute, query-free URL for a (route, locale) pair. */
export const absoluteUrl = (route: string, locale: string): string =>
  `${getCanonicalOrigin()}${localizedPath(route, locale)}`;

/**
 * The canonical for a page is its own localized URL with all query params
 * dropped. That's what folds ?address=, ?market= and ?currency= permutations
 * — the app's entire state surface — back into a single indexable URL.
 */
export const canonicalUrl = (route: string, locale: string): string =>
  absoluteUrl(route, locale);

export type AlternateLink = { hrefLang: string; href: string };

/**
 * Reciprocal alternate set for one route: every locale plus x-default. Each
 * alternate points at the *same route* in the other locale, so /interest
 * advertises /de/interest rather than the site root.
 */
export const alternateLinks = (route: string): AlternateLink[] => [
  ...LOCALES.map((locale) => ({
    hrefLang: locale,
    href: absoluteUrl(route, locale),
  })),
  { hrefLang: "x-default", href: absoluteUrl(route, DEFAULT_LOCALE) },
];

/**
 * Sitemap covering INDEXABLE_ROUTES x LOCALES, with each entry carrying the
 * full xhtml:link alternate set.
 *
 * No <lastmod>: the pages revalidate on a timer, so any value we could emit
 * here would either be a constant lie or a per-request "now" that trains
 * crawlers to distrust it. Omitting it is valid and honest. <priority> and
 * <changefreq> are omitted for the same reason — Google ignores both.
 */
export const buildSitemapXml = (): string => {
  const entries = INDEXABLE_ROUTES.flatMap((route) =>
    LOCALES.map((locale) => {
      const alternates = alternateLinks(route)
        .map(
          ({ hrefLang, href }) =>
            `    <xhtml:link rel="alternate" hreflang="${hrefLang}" href="${href}" />`,
        )
        .join("\n");
      return `  <url>\n    <loc>${absoluteUrl(route, locale)}</loc>\n${alternates}\n  </url>`;
    }),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
};
