/**
 * Share-card snapshots: the payload minted when a user shares a feature
 * module (position stats, liquidation scenario, or interest summary).
 *
 * Design rules (see the share plan):
 * - Cards are self-contained historical artifacts: every display string
 *   (market title, network icon name, symbols, USD figures) is denormalized
 *   into the payload at mint time so rendering never consults live market
 *   config. A card minted today must render unchanged years from now.
 * - Payloads are versioned and readers are backward/forward tolerant:
 *   anything unrecognized decodes to null and callers fall back to the
 *   branded default card — never an error.
 * - Sim edits are an optional attachment (`simOps`), captured by diffing
 *   workingData against fetchedData; `expect` records what the sharer saw so
 *   click-through can detect and explain divergence.
 */
import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

import type {
  AaveHealthFactorData,
  BorrowedAssetDataItem,
  ReserveAssetDataItem,
} from "../hooks/useAaveData";

export const SHARE_CARD_VERSION = 1;

/** Bump when the OG template design changes to naturally re-render cached
 * cards (the value rides in the image URL, which is the CDN cache key). */
export const OG_TEMPLATE_VERSION = 2;

/** Hard cap on a stored payload; anything bigger is rejected at mint. */
export const MAX_PAYLOAD_BYTES = 32 * 1024;

export const MAX_LIST_ITEMS = 6;
export const MAX_SIM_OPS = 100;
const MAX_STRING_LENGTH = 120;

/** HF tolerance for "reproduced": below this delta, live matches shared. */
export const HF_REPRODUCED_TOLERANCE = 0.02;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShareCardBase = {
  v: typeof SHARE_CARD_VERSION;
  /** address as the user entered it (0x… or ENS) */
  a: string;
  /** market id (informational; cards render from denormalized fields) */
  m: string;
  /** market title at mint time, e.g. "Ethereum v3" */
  mt: string;
  /** network icon name at mint time, e.g. "ethereum" */
  ni: string;
  /** unix seconds at mint */
  asOf: number;
};

export type InterestShareCard = ShareCardBase & {
  k: "interest";
  /** net / earned / paid interest in USD */
  net: number;
  earned: number;
  paid: number;
  /** unix seconds interest started accruing, if known */
  since: number | null;
  /** top assets by accrued USD, [symbol, usd] */
  top: [string, number][];
};

export type LiquidationShareCard = ShareCardBase & {
  k: "liq";
  /** health factor the sharer saw (after sim edits, if any) */
  hf: number;
  /** true when the shared state includes simulator edits */
  sim: boolean;
  drops: { s: string; from: number; to: number; pct: number }[];
};

export type PositionShareCard = ShareCardBase & {
  k: "position";
  hf: number;
  sim: boolean;
  borrowedUSD: number;
  /** borrowing power (available borrows) in USD */
  availableUSD: number;
  suppliedUSD: number;
  netUSD: number;
};

export type ShareCard =
  InterestShareCard | LiquidationShareCard | PositionShareCard;

export type ShareCardKind = ShareCard["k"];

export type SimOp =
  | { op: "addReserve"; s: string }
  | { op: "addBorrow"; s: string }
  | { op: "removeAsset"; s: string; t: "RESERVE" | "BORROW" }
  | { op: "reserveQty"; s: string; n: number }
  | { op: "borrowQty"; s: string; n: number }
  | { op: "price"; s: string; n: number }
  | { op: "collateral"; s: string; on: boolean };

/** Mint-time expectations used by the click-through reproduction check. */
export type ShareExpect = {
  /** HF the sharer saw (after sim edits, if any) */
  hf?: number;
  /** mint-time real position: [symbol, supply|borrow, quantity] */
  positions: [string, "s" | "b", number][];
  /** mint-time prices of assets shown on the card: [symbol, usd] */
  prices?: [string, number][];
};

export type SharePayload = {
  card: ShareCard;
  simOps?: SimOp[];
  expect?: ShareExpect;
};

// ---------------------------------------------------------------------------
// Validation (mint boundary + decode boundary)
// ---------------------------------------------------------------------------

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isShortString = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_STRING_LENGTH;

/** Syntactic address check only (0x-hex or plausible ENS-ish name). */
const isPlausibleAddress = (value: unknown): value is string =>
  isShortString(value) &&
  (/^0x[0-9a-fA-F]{40}$/.test(value) || /^[\w.-]{3,}\.[a-z]{2,}$/i.test(value));

const validateBase = (input: any): boolean =>
  !!input &&
  typeof input === "object" &&
  input.v === SHARE_CARD_VERSION &&
  isPlausibleAddress(input.a) &&
  isShortString(input.m) &&
  isShortString(input.mt) &&
  isShortString(input.ni) &&
  isFiniteNumber(input.asOf) &&
  input.asOf > 0;

const validateCard = (input: any): ShareCard | null => {
  if (!validateBase(input)) return null;
  if (input.k === "interest") {
    if (
      !isFiniteNumber(input.net) ||
      !isFiniteNumber(input.earned) ||
      !isFiniteNumber(input.paid) ||
      !(input.since === null || isFiniteNumber(input.since)) ||
      !Array.isArray(input.top) ||
      input.top.length > MAX_LIST_ITEMS ||
      !input.top.every(
        (entry: any) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          isShortString(entry[0]) &&
          isFiniteNumber(entry[1]),
      )
    ) {
      return null;
    }
    return input as InterestShareCard;
  }
  if (input.k === "liq") {
    if (
      !isFiniteNumber(input.hf) ||
      typeof input.sim !== "boolean" ||
      !Array.isArray(input.drops) ||
      input.drops.length === 0 ||
      input.drops.length > MAX_LIST_ITEMS ||
      !input.drops.every(
        (drop: any) =>
          !!drop &&
          isShortString(drop.s) &&
          isFiniteNumber(drop.from) &&
          isFiniteNumber(drop.to) &&
          isFiniteNumber(drop.pct),
      )
    ) {
      return null;
    }
    return input as LiquidationShareCard;
  }
  if (input.k === "position") {
    if (
      !isFiniteNumber(input.hf) ||
      typeof input.sim !== "boolean" ||
      !isFiniteNumber(input.borrowedUSD) ||
      !isFiniteNumber(input.availableUSD) ||
      !isFiniteNumber(input.suppliedUSD) ||
      !isFiniteNumber(input.netUSD)
    ) {
      return null;
    }
    return input as PositionShareCard;
  }
  return null;
};

const validateSimOp = (input: any): input is SimOp => {
  if (!input || typeof input !== "object" || !isShortString(input.s))
    return false;
  switch (input.op) {
    case "addReserve":
    case "addBorrow":
      return true;
    case "removeAsset":
      return input.t === "RESERVE" || input.t === "BORROW";
    case "reserveQty":
    case "borrowQty":
    case "price":
      return isFiniteNumber(input.n) && input.n >= 0;
    case "collateral":
      return typeof input.on === "boolean";
    default:
      return false;
  }
};

const validateExpect = (input: any): input is ShareExpect => {
  if (!input || typeof input !== "object") return false;
  if (input.hf !== undefined && !isFiniteNumber(input.hf)) return false;
  if (
    !Array.isArray(input.positions) ||
    input.positions.length > 64 ||
    !input.positions.every(
      (entry: any) =>
        Array.isArray(entry) &&
        entry.length === 3 &&
        isShortString(entry[0]) &&
        (entry[1] === "s" || entry[1] === "b") &&
        isFiniteNumber(entry[2]),
    )
  ) {
    return false;
  }
  if (input.prices !== undefined) {
    if (
      !Array.isArray(input.prices) ||
      input.prices.length > MAX_LIST_ITEMS ||
      !input.prices.every(
        (entry: any) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          isShortString(entry[0]) &&
          isFiniteNumber(entry[1]),
      )
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Validate an untrusted payload (mint endpoint, blob read, inline decode).
 * Returns a clean payload or null; never throws. Unknown versions/kinds
 * return null so callers fall back to the branded default card.
 */
export const validateSharePayload = (input: unknown): SharePayload | null => {
  try {
    if (!input || typeof input !== "object") return null;
    if (JSON.stringify(input).length > MAX_PAYLOAD_BYTES) return null;
    const raw = input as any;
    const card = validateCard(raw.card);
    if (!card) return null;
    const payload: SharePayload = { card };
    if (raw.simOps !== undefined) {
      if (!Array.isArray(raw.simOps) || raw.simOps.length > MAX_SIM_OPS)
        return null;
      if (!raw.simOps.every(validateSimOp)) return null;
      payload.simOps = raw.simOps;
    }
    if (raw.expect !== undefined) {
      if (!validateExpect(raw.expect)) return null;
      payload.expect = raw.expect;
    }
    return payload;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Inline encoding (fallback when the blob store is unavailable)
// ---------------------------------------------------------------------------

const toBase64 = (utf8: string): string => {
  if (typeof Buffer !== "undefined")
    return Buffer.from(utf8).toString("base64");
  return btoa(unescape(encodeURIComponent(utf8)));
};

const fromBase64 = (b64: string): string => {
  if (typeof Buffer !== "undefined")
    return Buffer.from(b64, "base64").toString("utf8");
  return decodeURIComponent(escape(atob(b64)));
};

/** base64url-encode a payload for the long-URL `?card=` fallback. */
export const encodeInlinePayload = (payload: SharePayload): string =>
  toBase64(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Card-only encoding for the inline OG image URL. The image renders from
 * the card alone; leaving simOps/expect out keeps the path segment short. */
export const encodeInlineCard = (card: ShareCard): string =>
  encodeInlinePayload({ card });

/** Decode + validate an inline `?card=` value. Null on any malformation. */
export const decodeInlinePayload = (encoded: string): SharePayload | null => {
  try {
    if (typeof encoded !== "string" || encoded.length > MAX_PAYLOAD_BYTES)
      return null;
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return validateSharePayload(JSON.parse(fromBase64(b64)));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Sim-edit capture (diff workingData vs fetchedData)
// ---------------------------------------------------------------------------

/** Round for fingerprint/diff comparisons: 6 significant digits. */
const round6 = (value: number): number => {
  if (!Number.isFinite(value) || value === 0) return 0;
  const magnitude = 10 ** (5 - Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value * magnitude) / magnitude;
};

const differs = (a: number | undefined, b: number | undefined): boolean =>
  round6(a ?? 0) !== round6(b ?? 0);

/**
 * Produce the ordered op list that transforms `fetched` into `working`.
 * Empty array means "no simulator edits" — the base case.
 */
export const diffSimOps = (
  fetched: AaveHealthFactorData | undefined,
  working: AaveHealthFactorData | undefined,
): SimOp[] => {
  if (!fetched || !working) return [];
  const ops: SimOp[] = [];
  const pricedSymbols = new Set<string>();

  const fetchedReserves = new Map(
    (fetched.userReservesData ?? []).map((item) => [item.asset.symbol, item]),
  );
  const fetchedBorrows = new Map(
    (fetched.userBorrowsData ?? []).map((item) => [item.asset.symbol, item]),
  );
  const workingReserves = new Map(
    (working.userReservesData ?? []).map((item) => [item.asset.symbol, item]),
  );
  const workingBorrows = new Map(
    (working.userBorrowsData ?? []).map((item) => [item.asset.symbol, item]),
  );

  const maybePriceOp = (
    symbol: string,
    workingAsset: { priceInUSD: number },
    fetchedAsset: { priceInUSD: number } | undefined,
  ) => {
    if (pricedSymbols.has(symbol)) return;
    // Newly added assets compare against their own initial price via the
    // fetched counterpart being absent — only explicit user price edits on
    // existing assets are captured; added assets get price ops only when
    // their working price differs from the market price they arrived with.
    const baseline = fetchedAsset?.priceInUSD;
    if (baseline !== undefined && differs(workingAsset.priceInUSD, baseline)) {
      ops.push({ op: "price", s: symbol, n: workingAsset.priceInUSD });
      pricedSymbols.add(symbol);
    }
  };

  // Added reserves (with their quantities), then edited reserves.
  workingReserves.forEach((item, symbol) => {
    const original = fetchedReserves.get(symbol);
    if (!original) {
      ops.push({ op: "addReserve", s: symbol });
      if (item.underlyingBalance > 0)
        ops.push({ op: "reserveQty", s: symbol, n: item.underlyingBalance });
      if (!item.usageAsCollateralEnabledOnUser)
        ops.push({ op: "collateral", s: symbol, on: false });
      return;
    }
    if (differs(item.underlyingBalance, original.underlyingBalance))
      ops.push({ op: "reserveQty", s: symbol, n: item.underlyingBalance });
    if (
      item.usageAsCollateralEnabledOnUser !==
      original.usageAsCollateralEnabledOnUser
    )
      ops.push({
        op: "collateral",
        s: symbol,
        on: item.usageAsCollateralEnabledOnUser,
      });
    maybePriceOp(symbol, item.asset, original.asset);
  });

  workingBorrows.forEach((item, symbol) => {
    const original = fetchedBorrows.get(symbol);
    if (!original) {
      ops.push({ op: "addBorrow", s: symbol });
      if (item.totalBorrows > 0)
        ops.push({ op: "borrowQty", s: symbol, n: item.totalBorrows });
      return;
    }
    if (differs(item.totalBorrows, original.totalBorrows))
      ops.push({ op: "borrowQty", s: symbol, n: item.totalBorrows });
    maybePriceOp(symbol, item.asset, original.asset);
  });

  // Removals last so replay applies adds/edits against a full position.
  fetchedReserves.forEach((_item, symbol) => {
    if (!workingReserves.has(symbol))
      ops.push({ op: "removeAsset", s: symbol, t: "RESERVE" });
  });
  fetchedBorrows.forEach((_item, symbol) => {
    if (!workingBorrows.has(symbol))
      ops.push({ op: "removeAsset", s: symbol, t: "BORROW" });
  });

  return ops.slice(0, MAX_SIM_OPS);
};

// ---------------------------------------------------------------------------
// Expected-state capture + reproduction check
// ---------------------------------------------------------------------------

/** Fingerprint the mint-time on-chain position (fetchedData, not sim). */
export const buildExpect = (
  fetched: AaveHealthFactorData | undefined,
  working: AaveHealthFactorData | undefined,
  cardSymbols: string[] = [],
): ShareExpect => {
  const positions: ShareExpect["positions"] = [];
  fetched?.userReservesData?.forEach((item: ReserveAssetDataItem) => {
    positions.push([item.asset.symbol, "s", round6(item.underlyingBalance)]);
  });
  fetched?.userBorrowsData?.forEach((item: BorrowedAssetDataItem) => {
    positions.push([item.asset.symbol, "b", round6(item.totalBorrows)]);
  });
  const expect: ShareExpect = { positions };
  const hf = working?.healthFactor;
  if (hf !== undefined && Number.isFinite(hf)) expect.hf = hf;

  const prices: [string, number][] = [];
  const wanted = new Set(cardSymbols);
  const record = (symbol: string, price: number) => {
    if (wanted.has(symbol) && !prices.some(([s]) => s === symbol))
      prices.push([symbol, round6(price)]);
  };
  fetched?.userReservesData?.forEach((item) =>
    record(item.asset.symbol, item.asset.priceInUSD),
  );
  fetched?.userBorrowsData?.forEach((item) =>
    record(item.asset.symbol, item.asset.priceInUSD),
  );
  if (prices.length) expect.prices = prices.slice(0, MAX_LIST_ITEMS);
  return expect;
};

export type ReplayResult = {
  applied: number;
  skipped: number;
  /** symbols whose ops could not be applied (assets no longer listed) */
  skippedSymbols: string[];
};

export type ReproductionCause =
  | { kind: "position-changed" }
  | { kind: "edits-skipped"; count: number; symbols: string[] }
  | {
      kind: "conditions-moved";
      liveHf: number;
      expectedHf: number;
      priceDeltas: { s: string; from: number; to: number }[];
    };

export type ReproductionStatus =
  | { status: "reproduced" }
  | { status: "diverged"; causes: ReproductionCause[] }
  | { status: "not-reproducible"; reason: "position-gone" | "market-gone" };

export type LiveState = {
  /** live workingData after any replay (what's on screen now) */
  healthFactor: number;
  reserves: { symbol: string; quantity: number; priceInUSD: number }[];
  borrows: { symbol: string; quantity: number; priceInUSD: number }[];
  /** true when the market in the snapshot no longer exists in the app */
  marketExists: boolean;
  /** live fetchedData position (pre-replay), for the fingerprint check */
  fetchedReserves: { symbol: string; quantity: number }[];
  fetchedBorrows: { symbol: string; quantity: number }[];
};

const fingerprintMatches = (
  expected: ShareExpect["positions"],
  live: LiveState,
): boolean => {
  const liveEntries = new Map<string, number>();
  live.fetchedReserves.forEach(({ symbol, quantity }) =>
    liveEntries.set(`s:${symbol}`, round6(quantity)),
  );
  live.fetchedBorrows.forEach(({ symbol, quantity }) =>
    liveEntries.set(`b:${symbol}`, round6(quantity)),
  );
  if (liveEntries.size !== expected.length) return false;
  return expected.every(([symbol, side, quantity]) => {
    const liveQuantity = liveEntries.get(`${side}:${symbol}`);
    if (liveQuantity === undefined) return false;
    // Tolerate interest-driven drift: balances grow continuously, so compare
    // at 0.5% relative tolerance rather than exact rounded equality.
    const scale = Math.max(Math.abs(quantity), Math.abs(liveQuantity), 1e-9);
    return Math.abs(liveQuantity - quantity) / scale <= 0.005;
  });
};

/**
 * Classify how well the live click-through state reproduces what the sharer
 * saw. Pure function; the share page renders the result as a status banner.
 */
export const checkReproduction = (
  expect: ShareExpect | undefined,
  live: LiveState,
  replay: ReplayResult,
): ReproductionStatus => {
  if (!live.marketExists) {
    return { status: "not-reproducible", reason: "market-gone" };
  }
  const hadPosition = (expect?.positions?.length ?? 0) > 0;
  const hasPosition =
    live.fetchedReserves.length > 0 || live.fetchedBorrows.length > 0;
  if (hadPosition && !hasPosition) {
    return { status: "not-reproducible", reason: "position-gone" };
  }

  const causes: ReproductionCause[] = [];

  if (expect && !fingerprintMatches(expect.positions, live)) {
    causes.push({ kind: "position-changed" });
  }

  if (replay.skipped > 0) {
    causes.push({
      kind: "edits-skipped",
      count: replay.skipped,
      symbols: replay.skippedSymbols,
    });
  }

  const expectedHf = expect?.hf;
  const hfMatches =
    expectedHf === undefined ||
    !Number.isFinite(live.healthFactor) ||
    Math.abs(live.healthFactor - expectedHf) <= HF_REPRODUCED_TOLERANCE;

  if (!hfMatches && causes.length === 0) {
    // Position matches and edits replayed fully, yet HF moved: prices or
    // risk parameters changed. Name the price deltas that explain it.
    const livePrices = new Map<string, number>();
    live.reserves.forEach(({ symbol, priceInUSD }) =>
      livePrices.set(symbol, priceInUSD),
    );
    live.borrows.forEach(({ symbol, priceInUSD }) => {
      if (!livePrices.has(symbol)) livePrices.set(symbol, priceInUSD);
    });
    const priceDeltas = (expect?.prices ?? [])
      .filter(([symbol, from]) => {
        const now = livePrices.get(symbol);
        return now !== undefined && differs(now, from);
      })
      .map(([symbol, from]) => ({
        s: symbol,
        from,
        to: livePrices.get(symbol)!,
      }));
    causes.push({
      kind: "conditions-moved",
      liveHf: live.healthFactor,
      expectedHf,
      priceDeltas,
    });
  } else if (!hfMatches) {
    // HF differs but a stronger cause (position change / skipped edits)
    // already explains the divergence; no extra cause needed.
  }

  return causes.length
    ? { status: "diverged", causes }
    : { status: "reproduced" };
};

// ---------------------------------------------------------------------------
// Localized copy: title / description / tweet
// ---------------------------------------------------------------------------

export const fmtUSD = (
  locale: string,
  value: number,
  { compact = false }: { compact?: boolean } = {},
): string =>
  new Intl.NumberFormat(locale || "en", {
    style: "currency",
    currency: "USD",
    ...(compact
      ? { notation: "compact" as const, maximumFractionDigits: 1 }
      : { maximumFractionDigits: 0 }),
  }).format(value);

export const fmtSignedUSD = (locale: string, value: number): string =>
  `${value > 0 ? "+" : ""}${fmtUSD(locale, value)}`;

export const fmtMonthYear = (locale: string, unixSeconds: number): string =>
  new Intl.DateTimeFormat(locale || "en", {
    month: "short",
    year: "numeric",
  }).format(new Date(unixSeconds * 1000));

/** Sentinel for infinite health factors (no debt): Infinity doesn't survive
 * JSON, so builders store this instead and displays render ∞. */
export const HF_INFINITY_SENTINEL = 1e9;

export const fmtHf = (hf: number): string =>
  hf === Infinity || hf >= HF_INFINITY_SENTINEL ? "∞" : hf.toFixed(2);

/** Map a live health factor to its JSON-safe stored form. */
export const toStoredHf = (hf: number | undefined): number => {
  if (hf === undefined || Number.isNaN(hf)) return 0;
  // aave-utilities (and this app) represent "no debt" as -1; for display
  // purposes that's an infinite health factor, not "HF -1.00".
  if (hf < 0) return HF_INFINITY_SENTINEL;
  if (!Number.isFinite(hf) || hf >= HF_INFINITY_SENTINEL)
    return HF_INFINITY_SENTINEL;
  return hf;
};

export const abbreviateAddress = (address: string): string =>
  /^0x[0-9a-fA-F]{40}$/.test(address)
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;

/** Terse scenario list: "WBTC drops to $41.2K, WETH drops to $1.9K (+1 more)" */
const dropsScenario = (
  i18n: I18n,
  card: LiquidationShareCard,
  { compact }: { compact: boolean },
): string => {
  const locale = i18n.locale;
  const shown = card.drops.slice(0, 2);
  const parts = shown.map(
    (drop) =>
      t(i18n)`${drop.s} drops to ${fmtUSD(locale, drop.to, { compact })}`,
  );
  const joined = parts.join(", ");
  const extra = card.drops.length - shown.length;
  return extra > 0 ? t(i18n)`${joined} (+${extra} more)` : joined;
};

/** The liquidation card describes ONE path to liquidation, not the only one.
 * Keep this wording identical to the line rendered in ogCard.tsx so both
 * share a single translation entry. */
const liquidationDisclaimer = (i18n: I18n): string =>
  t(
    i18n,
  )`One scenario of many — accruing interest, oracle prices, and governance-set risk parameters all shift liquidation risk`;

export const getShareTitle = (card: ShareCard, i18n: I18n): string => {
  const locale = i18n.locale;
  const address = abbreviateAddress(card.a);
  switch (card.k) {
    case "liq":
      return t(
        i18n,
      )`${address} on Aave: if ${dropsScenario(i18n, card, { compact: true })}, then liquidation`;
    case "interest": {
      const net = fmtSignedUSD(locale, card.net);
      return card.since !== null
        ? t(
            i18n,
          )`${address}: ${net} net Aave interest since ${fmtMonthYear(locale, card.since)}`
        : t(i18n)`${address}: ${net} net Aave interest`;
    }
    case "position":
    default: {
      const power = fmtUSD(locale, card.availableUSD, { compact: true });
      return card.sim
        ? t(
            i18n,
          )`${address} simulated on Aave: HF ${fmtHf(card.hf)} with ${power} borrowing power`
        : t(
            i18n,
          )`${address} on Aave: HF ${fmtHf(card.hf)} with ${power} borrowing power`;
    }
  }
};

/** Market titles are minted bare ("Ethereum v3"); brand them explicitly. */
const marketLabel = (card: ShareCard): string => `Aave ${card.mt}`;

export const getShareDescription = (card: ShareCard, i18n: I18n): string => {
  const locale = i18n.locale;
  const address = abbreviateAddress(card.a);
  switch (card.k) {
    case "liq": {
      const path = card.drops
        .slice(0, 3)
        .map(
          (drop) =>
            `${drop.s} −${Math.abs(Math.round(drop.pct))}% → ${fmtUSD(
              locale,
              drop.to,
            )}`,
        )
        .join(" · ");
      const simNote = card.sim ? `${t(i18n)`Simulated position`} · ` : "";
      return t(
        i18n,
      )`HF ${fmtHf(card.hf)} → 1.00 if ${path} · ${simNote}${address} · ${marketLabel(card)} · ${liquidationDisclaimer(i18n)}`;
    }
    case "interest": {
      const top = card.top
        .slice(0, 3)
        .map(([symbol, usd]) => `${symbol} ${fmtSignedUSD(locale, usd)}`)
        .join(" · ");
      const detail = top.length ? ` · ${top}` : "";
      return t(
        i18n,
      )`Earned ${fmtUSD(locale, card.earned)} · paid ${fmtUSD(locale, card.paid)} · reconstructed from on-chain events, not APY estimates${detail} · ${address} · ${marketLabel(card)}`;
    }
    case "position":
    default: {
      const simNote = card.sim ? `${t(i18n)`Simulated position`} · ` : "";
      return t(
        i18n,
      )`${simNote}${fmtUSD(locale, card.suppliedUSD)} supplied · ${fmtUSD(
        locale,
        card.borrowedUSD,
      )} borrowed · ${fmtUSD(locale, card.availableUSD)} borrowing power · net ${fmtUSD(
        locale,
        card.netUSD,
      )} · ${address} · ${marketLabel(card)}`;
    }
  }
};

export const getShareTweet = (card: ShareCard, i18n: I18n): string => {
  switch (card.k) {
    case "liq":
      // Title already carries the terse scenario; append the HF path and the
      // "one scenario" caveat rather than the full description.
      return `${getShareTitle(card, i18n)} · HF ${fmtHf(card.hf)} → 1.00 · ${liquidationDisclaimer(i18n)}`;
    case "interest":
      return `${getShareTitle(card, i18n)} — ${getShareDescription(card, i18n)}`;
    case "position":
    default:
      return `${getShareTitle(card, i18n)} — ${getShareDescription(card, i18n)}`;
  }
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export const getSiteUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL)
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  // In the browser, prefer the actual origin: production resolves to the
  // canonical domain anyway, while localhost/deploy previews mint links that
  // really work there (a prod URL for a locally-stored blob resolves to
  // nothing when pasted elsewhere).
  if (typeof window !== "undefined") return window.location.origin;
  return "https://defisim.xyz";
};

/** Absolute share URL for a minted snapshot, locale-prefixed when non-en. */
export const getShareUrl = (id: string, locale?: string): string => {
  const prefix = locale && locale !== "en" ? `/${locale}` : "";
  return `${getSiteUrl()}${prefix}/s/${id}`;
};

/** Share URL for the inline-payload fallback (blob store unavailable). */
export const getShareUrlInline = (encoded: string, locale?: string): string => {
  const prefix = locale && locale !== "en" ? `/${locale}` : "";
  return `${getSiteUrl()}${prefix}/s/inline?card=${encoded}`;
};

/**
 * OG image URLs carry every variant (template version, locale, payload
 * reference) in the PATH, never the query string: Netlify's Next runtime
 * pins the edge cache key to the path + internal Next params only
 * (`Netlify-Vary: query=__nextDataReq|_rsc`), so query-varied images would
 * all collapse into one year-long immutable cache entry.
 *
 * Shape: /api/og/{templateVersion}/{locale}/{kind}/{value}.png
 */
const ogImagePath = (kind: "id" | "a" | "c", value: string, locale?: string) =>
  `${getSiteUrl()}/api/og/${OG_TEMPLATE_VERSION}/${locale || "en"}/${kind}/${value}.png`;

/** Absolute OG image URL for a minted snapshot. */
export const getOgImageUrl = (id: string, locale?: string): string =>
  ogImagePath("id", id, locale);

/** OG image URL for the inline fallback: the card rides in the path. */
export const getOgImageUrlInline = (card: ShareCard, locale?: string): string =>
  ogImagePath("c", encodeInlineCard(card), locale);

/** OG image URL for the crawler-rewritten pasted-URL card (address only). */
export const getOgImageUrlForAddress = (
  address: string,
  locale?: string,
): string => ogImagePath("a", encodeURIComponent(address), locale);
