const linguiConfig = require("./lingui.config");

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer({
  reactStrictMode: false,
  i18n: {
    locales: linguiConfig.locales,
    defaultLocale: "en",
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
