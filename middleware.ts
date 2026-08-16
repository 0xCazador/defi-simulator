import { NextRequest, NextResponse } from "next/server";

/**
 * Pasted-URL share previews: most people share by copying the address bar,
 * and those URLs (/?address=…) are client-rendered, so crawlers see generic
 * meta. Rewrite crawler requests — and only crawler requests — to a tiny
 * SSR route that emits address-aware tags with zero RPC. Humans never hit
 * the rewrite; the homepage stays fully client-rendered.
 */
const CRAWLER_PATTERN =
  /twitterbot|slackbot|discordbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|pinterest|redditbot|embedly|quora link preview|vkshare|applebot|bingbot|googlebot|yandex|baiduspider|duckduckbot|skypeuripreview|iframely/i;

/** Keep in sync with the share pages: only these client routes carry
 * address query params worth upgrading for crawlers. */
const REWRITABLE_PATHS = new Set(["/", "/interest"]);

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!CRAWLER_PATTERN.test(userAgent)) return NextResponse.next();

  // nextUrl is locale-stripped under pages-router i18n; locale is preserved
  // on the rewrite so the fallback route renders localized meta.
  if (!REWRITABLE_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const address = request.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/share-fallback";
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/", "/interest"],
};
