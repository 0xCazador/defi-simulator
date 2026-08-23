/**
 * Downloads the Google Fonts woff2 subsets into public/fonts and writes the
 * matching @font-face rules to css/fonts.css.
 *
 * Run this when the font stack in theme/index.ts changes:
 *
 *   node scripts/fetchFonts.mjs
 *
 * Why self-host at all: the Google Fonts stylesheet is a render-blocking
 * request to a third origin, so first paint waits on a DNS lookup, a TLS
 * handshake and a redirect before it can even discover which font files it
 * needs. Serving the same subsets from our own origin folds them into the
 * existing CSS bundle.
 *
 * Every subset Google offers is kept, not just latin: the app ships 63 locales,
 * and dropping the cyrillic/greek/vietnamese ranges would silently downgrade
 * Russian, Ukrainian, Greek, Vietnamese and friends to a system font. Browsers
 * only fetch the ranges they actually render, so the file count is free.
 */
import { mkdir, readdir, rm, writeFile } from "fs/promises";
import path from "path";

const FAMILIES =
  "family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;600";
const CSS_URL = `https://fonts.googleapis.com/css2?${FAMILIES}&display=swap`;

// Google serves woff2 only to user agents it recognizes as supporting it.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const CSS_OUT = path.join(process.cwd(), "css", "fonts.css");

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const parseFaces = (css) => {
  const faces = [];
  // Each block is preceded by a /* subset */ comment naming the unicode range.
  const blockPattern = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let match = blockPattern.exec(css);
  while (match !== null) {
    const [, subset, body] = match;
    const field = (name) => {
      const found = body.match(new RegExp(`${name}:\\s*([^;]+);`));
      return found ? found[1].trim() : null;
    };
    const family = field("font-family")?.replace(/['"]/g, "");
    const weight = field("font-weight");
    const style = field("font-style");
    const unicodeRange = field("unicode-range");
    const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (family && weight && url && unicodeRange) {
      faces.push({
        family,
        weight: Number(weight),
        style: style ?? "normal",
        subset,
        unicodeRange,
        url,
      });
    }
    match = blockPattern.exec(css);
  }
  return faces;
};

/**
 * Collapse the declarations that share a file.
 *
 * These are variable fonts: Google emits one @font-face per requested weight,
 * but every weight of a family/subset points at the same woff2. Downloading
 * that file once per weight would make a browser needing 400 and 700 fetch the
 * same 48KB twice, so each distinct URL becomes a single face with a weight
 * range and the variable axis covers the rest.
 */
const dedupeByFile = (faces) => {
  const groups = new Map();
  faces.forEach((face) => {
    const existing = groups.get(face.url);
    if (existing) {
      existing.weights.push(face.weight);
      return;
    }
    groups.set(face.url, {
      family: face.family,
      style: face.style,
      subset: face.subset,
      unicodeRange: face.unicodeRange,
      url: face.url,
      weights: [face.weight],
      file: `${slug(face.family)}-${face.subset}.woff2`,
    });
  });
  return [...groups.values()].map((group) => {
    const min = Math.min(...group.weights);
    const max = Math.max(...group.weights);
    return { ...group, weight: min === max ? `${min}` : `${min} ${max}` };
  });
};

const main = async () => {
  const cssResponse = await fetch(CSS_URL, { headers: { "User-Agent": UA } });
  if (!cssResponse.ok) {
    throw new Error(`Google Fonts CSS request failed: ${cssResponse.status}`);
  }
  const parsed = parseFaces(await cssResponse.text());
  if (!parsed.length) throw new Error("No @font-face blocks parsed.");
  const faces = dedupeByFile(parsed);

  await mkdir(FONT_DIR, { recursive: true });

  // Drop woff2 files from a previous run so renamed subsets don't linger. The
  // .ttf files stay: utils/ogCard reads those at request time.
  const existing = await readdir(FONT_DIR);
  await Promise.all(
    existing
      .filter((name) => name.endsWith(".woff2"))
      .map((name) => rm(path.join(FONT_DIR, name))),
  );

  let bytes = 0;
  for (const face of faces) {
    const response = await fetch(face.url, { headers: { "User-Agent": UA } });
    if (!response.ok) {
      throw new Error(`Failed to download ${face.url}: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    bytes += buffer.byteLength;
    await writeFile(path.join(FONT_DIR, face.file), buffer);
  }

  const rules = faces
    .map((face) =>
      [
        `/* ${face.family} ${face.weight} — ${face.subset} */`.replace(
          / +/g,
          " ",
        ),
        "@font-face {",
        `  font-family: "${face.family}";`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weight};`,
        // swap, not optional: text must be readable immediately, and a late
        // swap is preferable to permanently losing the brand typeface.
        "  font-display: swap;",
        `  src: url("/fonts/${face.file}") format("woff2");`,
        `  unicode-range: ${face.unicodeRange};`,
        "}",
      ].join("\n"),
    )
    .join("\n\n");

  const header = [
    "/*",
    " * Generated by scripts/fetchFonts.mjs — do not edit by hand.",
    " *",
    " * Self-hosted Google Fonts subsets. Keeps first paint off a third-party",
    " * origin; browsers still fetch only the unicode ranges they render.",
    " */",
    "",
  ].join("\n");

  await writeFile(CSS_OUT, `${header}\n${rules}\n`);

  console.log(
    `Wrote ${faces.length} faces (${(bytes / 1024).toFixed(0)} KB) and ${path.relative(process.cwd(), CSS_OUT)}`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
