const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  reactStrictMode: false,
  i18n: {
    locales: ['en'], // More coming soon via #5
    defaultLocale: 'en',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
   productionBrowserSourceMaps: true,
});
