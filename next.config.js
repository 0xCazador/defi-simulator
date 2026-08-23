const linguiConfig = require("./lingui.config");

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer({
  reactStrictMode: false,
  // The dev static-route indicator crashes on load: the HMR socket can
  // deliver its isrManifest message before window.next.router exists, and
  // handleStaticIndicator dereferences it unguarded ("[HMR] Invalid message"
  // + TypeError in the console). Disabling the indicator compiles that code
  // path out; error overlays are unaffected.
  devIndicators: false,
  i18n: {
    locales: linguiConfig.locales,
    defaultLocale: "en",
    // Accept-Language redirects made "/" a moving target: the same URL served
    // 62 different documents depending on the request, which muddies the
    // canonical set and puts a 302 in front of every crawl. hreflang tags
    // advertise the localized URLs instead, and the footer's language picker
    // still lets people switch.
    localeDetection: false,
  },
  async rewrites() {
    return [
      // The sitemap is built by an API route (those are exempt from locale
      // prefixing, unlike a pages/sitemap.xml route which i18n would fan out
      // into 63 copies) but has to be served from the conventional path that
      // robots.txt advertises.
      //
      // No `locale: false` here: i18n normalizes an unprefixed request to the
      // default locale internally, so a locale-exempt source never matches
      // and /sitemap.xml 404s. Letting the source stay locale-aware also
      // answers /de/sitemap.xml, which is harmless — the document contains
      // absolute URLs either way, and robots.txt advertises only the one.
      { source: "/sitemap.xml", destination: "/api/sitemap" },
    ];
  },
  // The OG image function reads fonts and icon SVGs from disk at request
  // time; make sure file tracing bundles them into the serverless function.
  outputFileTracingIncludes: {
    "/api/og/[[...slug]]": ["./public/fonts/**", "./public/icons/**"],
  },
  productionBrowserSourceMaps: true,
  webpack: (config) => {
    // Custom .babelrc disables SWC, so Next adds optimizePackageImports
    // (including react-icons/*) to transpilePackages. Babel then compiles
    // those 500KB+ barrels and logs compact-deopt notes. The packs are already
    // browser ESM; skip Babel and let webpack tree-shake them.
    const skipBabel = /[/\\]node_modules[/\\]react-icons[/\\]/;
    const usesBabel = (rule) => {
      const uses = []
        .concat(rule.use || [])
        .concat(rule.loader || [])
        .flat()
        .filter(Boolean);
      return uses.some((use) => {
        const loader = typeof use === "string" ? use : use.loader;
        return typeof loader === "string" && loader.includes("babel/loader");
      });
    };
    const patch = (rule) => {
      if (!rule || typeof rule !== "object") return;
      if (Array.isArray(rule.oneOf)) rule.oneOf.forEach(patch);
      if (Array.isArray(rule.rules)) rule.rules.forEach(patch);
      if (!usesBabel(rule)) return;
      const prev = rule.exclude;
      rule.exclude = (resource) => {
        if (skipBabel.test(resource)) return true;
        if (typeof prev === "function") return prev(resource);
        if (prev instanceof RegExp) return prev.test(resource);
        if (Array.isArray(prev)) {
          return prev.some((entry) =>
            typeof entry === "function"
              ? entry(resource)
              : entry instanceof RegExp && entry.test(resource),
          );
        }
        return false;
      };
    };
    config.module.rules.forEach(patch);
    return config;
  },
});
