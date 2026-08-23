/**
 * Serves the sitemap. Reached at /sitemap.xml via a rewrite in next.config.js
 * rather than a pages/sitemap.xml route, because pages-router i18n would
 * prefix a page route into 62 copies (/de/sitemap.xml, /fr/sitemap.xml, …).
 * API routes are exempt from locale prefixing.
 */
import type { NextApiRequest, NextApiResponse } from "next";

import { buildSitemapXml } from "../../utils/seo";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>,
) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // The URL set only changes on deploy, so let the CDN own it.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400");
  res.status(200).send(buildSitemapXml());
}
