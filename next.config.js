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
});
