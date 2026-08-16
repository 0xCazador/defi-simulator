/**
 * OG image endpoint: renders a 1200×630 PNG for a share snapshot, an
 * address-only card for crawler-rewritten pasted URLs, or the branded
 * default card.
 *
 * URL shape: /api/og/{templateVersion}/{locale}/{kind}/{value}.png
 *   kind "id" — minted snapshot id (blob store)
 *   kind "c"  — inline base64url card (blob store was unavailable at mint)
 *   kind "a"  — address-only card for pasted app URLs
 * Bare /api/og renders the default card.
 *
 * Every variant lives in the PATH on purpose: Netlify's Next runtime keys
 * the edge cache on the path plus internal Next query params only
 * (`Netlify-Vary: query=__nextDataReq|_rsc`), so query-string variants
 * would all collapse into a single year-long immutable cache entry.
 *
 * Contract:
 * - Never 500s: any failure (unknown ID, corrupt payload, font/icon problem)
 *   renders the branded default card with HTTP 200. Crawlers must never see
 *   a broken image.
 * - Zero RPC: everything renders from the stored payload / path params.
 * - Immutable caching: content is addressed by id + locale + template
 *   version, all of which live in the URL path (the CDN cache key).
 *
 * Node runtime on purpose (this repo compiles with Babel; Edge + wasm on
 * Netlify is the classic footgun). Rendering is milliseconds.
 */
import { promises as fs } from "fs";
import path from "path";
import type { ReactElement } from "react";
import type { NextApiRequest, NextApiResponse } from "next";
import { ImageResponse } from "next/og";
import type { I18n } from "@lingui/core";

import {
  OG_HEIGHT,
  OG_WIDTH,
  OgIcons,
  renderCard,
  renderDefaultCard,
} from "../../../utils/ogCard";
import { SharePayload, decodeInlinePayload } from "../../../utils/shareCard";
import { getShare } from "../../../utils/shareStore";
import { loadServerI18n } from "../../../utils/serverI18n";
import { getTokenIconName } from "../../../components/TokenIcon";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const FONTS_DIR = path.join(PUBLIC_DIR, "fonts");

/** Locales whose script the bundled Latin/Cyrillic/Greek fonts don't cover.
 * Each needs a Noto subset in public/fonts; when the file is absent, the
 * image falls back to English labels (meta text stays localized). */
const SCRIPT_FONT_BY_LOCALE: Record<string, string> = {
  ja: "noto-sans-jp-400.ttf",
  "zh-Hans": "noto-sans-sc-400.ttf",
  ko: "noto-sans-kr-400.ttf",
  hi: "noto-sans-devanagari-400.ttf",
  ne: "noto-sans-devanagari-400.ttf",
  ks: "noto-sans-devanagari-400.ttf",
  bn: "noto-sans-bengali-400.ttf",
  pa: "noto-sans-gurmukhi-400.ttf",
  ta: "noto-sans-tamil-400.ttf",
  ml: "noto-sans-malayalam-400.ttf",
  th: "noto-sans-thai-400.ttf",
  my: "noto-sans-myanmar-400.ttf",
  km: "noto-sans-khmer-400.ttf",
  ka: "noto-sans-georgian-400.ttf",
  hy: "noto-sans-armenian-400.ttf",
  jv: "noto-sans-javanese-400.ttf",
};

type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
};

// Font files never change within a deployment; cache across invocations.
let cachedBaseFonts: OgFont[] | null = null;
const extraFontCache = new Map<string, OgFont | null>();

const readFont = async (
  file: string,
  name: string,
  weight: OgFont["weight"],
): Promise<OgFont> => {
  const data = await fs.readFile(path.join(FONTS_DIR, file));
  return {
    name,
    data: data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer,
    weight,
    style: "normal",
  };
};

const loadBaseFonts = async (): Promise<OgFont[]> => {
  if (!cachedBaseFonts) {
    cachedBaseFonts = await Promise.all([
      readFont("inter-400.ttf", "Inter", 400),
      readFont("inter-600.ttf", "Inter", 600),
      readFont("space-grotesk-700.ttf", "Space Grotesk", 700),
      readFont("jetbrains-mono-400.ttf", "JetBrains Mono", 400),
    ]);
  }
  return cachedBaseFonts;
};

/**
 * Resolve fonts + the effective label locale. Locales needing an unbundled
 * script render English labels rather than tofu boxes.
 */
const resolveFontsAndLocale = async (
  locale: string,
): Promise<{ fonts: OgFont[]; effectiveLocale: string }> => {
  const fonts = [...(await loadBaseFonts())];
  const scriptFont = SCRIPT_FONT_BY_LOCALE[locale];
  if (!scriptFont) return { fonts, effectiveLocale: locale };
  if (!extraFontCache.has(scriptFont)) {
    try {
      extraFontCache.set(scriptFont, await readFont(scriptFont, "Inter", 400));
    } catch {
      extraFontCache.set(scriptFont, null);
    }
  }
  const extra = extraFontCache.get(scriptFont);
  if (extra) {
    fonts.push(extra);
    return { fonts, effectiveLocale: locale };
  }
  return { fonts, effectiveLocale: "en" };
};

const readSvgDataUri = async (relative: string): Promise<string | null> => {
  try {
    const buffer = await fs.readFile(path.join(PUBLIC_DIR, relative));
    return `data:image/svg+xml;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
};

/** Resolve the token/network icons a card references into data URIs. */
const resolveIcons = async (payload: SharePayload): Promise<OgIcons> => {
  const { card } = payload;
  const symbols = new Set<string>();
  if (card.k === "liq") card.drops.forEach((drop) => symbols.add(drop.s));
  if (card.k === "interest")
    card.top.forEach(([symbol]) => symbols.add(symbol));
  const icons: OgIcons = {};
  await Promise.all([
    ...[...symbols].map(async (symbol) => {
      icons[`token:${symbol}`] = await readSvgDataUri(
        path.join("icons", "tokens", `${getTokenIconName(symbol)}.svg`),
      );
    }),
    (async () => {
      icons[`network:${card.ni}`] = await readSvgDataUri(
        path.join("icons", "networks", `${card.ni}.svg`),
      );
    })(),
  ]);
  return icons;
};

/** Address text on the address-only card is user-controlled; keep it tame. */
const sanitizeAddress = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 60);
  return /^[\w.\-…]+$/.test(trimmed) ? trimmed : undefined;
};

type OgRequest = {
  locale: string;
  kind: "default" | "id" | "c" | "a";
  value?: string;
};

/**
 * Parse /api/og/{tv}/{locale}/{kind}/{value}.png path segments. The template
 * version segment only exists to bust CDN entries across redesigns; its
 * value is not otherwise meaningful. Malformed paths render the default
 * card (never an error).
 */
const parseSlug = (slug: string | string[] | undefined): OgRequest => {
  const segments = typeof slug === "string" ? [slug] : (slug ?? []);
  if (segments.length === 0) return { locale: "en", kind: "default" };
  if (segments.length !== 4) return { locale: "en", kind: "default" };
  const [, locale, kind, rawValue] = segments;
  const value = rawValue.replace(/\.png$/, "");
  if ((kind === "id" || kind === "c" || kind === "a") && value) {
    return { locale, kind, value };
  }
  return { locale, kind: "default" };
};

const sendPng = async (
  res: NextApiResponse,
  element: ReactElement,
  fonts: OgFont[],
) => {
  const image = new ImageResponse(element, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  });
  const buffer = Buffer.from(await image.arrayBuffer());
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).end(buffer);
};

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  let i18n: I18n | null = null;
  let fonts: OgFont[] = [];
  try {
    const request = parseSlug(_req.query.slug);

    const { fonts: resolvedFonts, effectiveLocale } =
      await resolveFontsAndLocale(request.locale);
    fonts = resolvedFonts;
    i18n = await loadServerI18n(effectiveLocale);

    let payload: SharePayload | null = null;
    if (request.kind === "id") payload = await getShare(request.value);
    else if (request.kind === "c")
      payload = decodeInlinePayload(request.value!);

    if (payload) {
      const icons = await resolveIcons(payload);
      await sendPng(res, renderCard(payload.card, { i18n, icons }), fonts);
      return;
    }

    const address =
      request.kind === "a"
        ? sanitizeAddress(decodeURIComponent(request.value!))
        : undefined;
    await sendPng(res, renderDefaultCard(i18n, { address }), fonts);
  } catch (err) {
    console.error("OG render failed, serving default card:", err);
    try {
      if (!fonts.length) fonts = await loadBaseFonts();
      if (!i18n) i18n = await loadServerI18n("en");
      await sendPng(res, renderDefaultCard(i18n), fonts);
    } catch (fallbackErr) {
      // Last resort: a 1×1 transparent PNG so crawlers still get an image.
      console.error("OG fallback render failed:", fallbackErr);
      const pixel = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      );
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(200).end(pixel);
    }
  }
};

export default handler;
