import {
  DEFAULT_LOCALE,
  INDEXABLE_ROUTES,
  LOCALES,
  alternateLinks,
  buildSitemapXml,
  canonicalUrl,
  getCanonicalOrigin,
  isIndexableRoute,
  localizedPath,
} from "../../utils/seo";

import linguiConfig from "../../lingui.config";

// lingui.config.js is CJS annotated with @type LinguiConfig, whose `locales`
// isn't a plain string[] as far as tsc is concerned. This is the list Next is
// configured with, so treat it as the source of truth it is.
const configuredLocales = (linguiConfig as unknown as { locales: string[] })
  .locales;

const ORIGIN = "https://defisim.xyz";

describe("locale surface", () => {
  it("matches the lingui catalog list exactly", () => {
    // SeoHead reads locales from src/languages/index.json to keep the
    // TranslationIO key in lingui.config.js out of the client bundle. If the
    // two ever drift, hreflang starts advertising URLs Next won't serve.
    expect([...LOCALES].sort()).toEqual([...configuredLocales].sort());
  });

  it("includes the default locale", () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("localizedPath", () => {
  it("leaves the default locale unprefixed", () => {
    expect(localizedPath("/", "en")).toBe("/");
    expect(localizedPath("/interest", "en")).toBe("/interest");
  });

  it("prefixes every other locale", () => {
    expect(localizedPath("/", "de")).toBe("/de");
    expect(localizedPath("/interest", "de")).toBe("/de/interest");
    expect(localizedPath("/interest", "zh-Hans")).toBe("/zh-Hans/interest");
  });
});

describe("canonicalUrl", () => {
  it("is absolute and carries no query string", () => {
    LOCALES.forEach((locale) => {
      INDEXABLE_ROUTES.forEach((route) => {
        const url = canonicalUrl(route, locale);
        expect(url.startsWith(`${ORIGIN}/`)).toBe(true);
        expect(url).not.toContain("?");
      });
    });
  });

  it("never points at the production origin's deploy previews", () => {
    expect(getCanonicalOrigin()).toBe(ORIGIN);
  });
});

describe("alternateLinks", () => {
  it("covers every locale plus x-default", () => {
    const alternates = alternateLinks("/");
    expect(alternates).toHaveLength(LOCALES.length + 1);
    expect(alternates.filter((a) => a.hrefLang === "x-default")).toHaveLength(
      1,
    );
  });

  it("points x-default at the unprefixed English URL", () => {
    const alternates = alternateLinks("/interest");
    const xDefault = alternates.find((a) => a.hrefLang === "x-default");
    expect(xDefault?.href).toBe(`${ORIGIN}/interest`);
  });

  it("keeps alternates on the same route", () => {
    // The bug this replaced: every alternate pointed at the site root, so
    // /interest claimed the homepage as its German translation.
    const alternates = alternateLinks("/interest");
    alternates
      .filter((a) => a.hrefLang !== "x-default")
      .forEach((alternate) => {
        expect(alternate.href.endsWith("/interest")).toBe(true);
      });
  });

  it("is reciprocal: each locale's set resolves to the same URLs", () => {
    const fromRoot = alternateLinks("/").map((a) => a.href);
    LOCALES.forEach((locale) => {
      expect(fromRoot).toContain(canonicalUrl("/", locale));
    });
  });
});

describe("isIndexableRoute", () => {
  it("accepts the app routes and rejects the noindex ones", () => {
    expect(isIndexableRoute("/")).toBe(true);
    expect(isIndexableRoute("/interest")).toBe(true);
    expect(isIndexableRoute("/share-fallback")).toBe(false);
    expect(isIndexableRoute("/s/abc123")).toBe(false);
  });
});

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml();

  it("declares the sitemap and xhtml namespaces", () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  it("emits one <url> per route per locale", () => {
    const locs = xml.match(/<loc>/g) ?? [];
    expect(locs).toHaveLength(INDEXABLE_ROUTES.length * LOCALES.length);
  });

  it("gives every entry the full alternate set", () => {
    const alternates = xml.match(/<xhtml:link/g) ?? [];
    expect(alternates).toHaveLength(
      INDEXABLE_ROUTES.length * LOCALES.length * (LOCALES.length + 1),
    );
  });

  it("lists both routes for the default locale", () => {
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/interest</loc>`);
  });

  it("excludes the noindex share surfaces", () => {
    expect(xml).not.toContain("/share-fallback");
    expect(xml).not.toContain("<loc>https://defisim.xyz/s/");
  });

  it("has no unescaped ampersands", () => {
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  });
});
