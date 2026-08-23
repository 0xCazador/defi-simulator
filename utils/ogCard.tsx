/**
 * OG card renderer: pure JSX view of a ShareCard for Satori/ImageResponse.
 *
 * Framework-agnostic by design — pages/api/og.tsx consumes it today and a
 * future App Router opengraph-image.tsx can import it unchanged. Keep this
 * module free of react-dom, Mantine, ethers, and hooks: Satori evaluates the
 * JSX itself. Only flexbox layout and a CSS subset are supported, so every
 * multi-child element sets display:flex explicitly.
 *
 * Colors mirror theme/index.ts (the app is dark-only): page #131a25, raised
 * surface #1d2432, border #3b4658, text #e8eef7, dimmed #96a3b8, brand
 * #4d8dff, hf-safe green #38d9a9, sim amber #fcc419.
 */
import type { ReactElement } from "react";
import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

import {
  InterestShareCard,
  LiquidationShareCard,
  PositionShareCard,
  ShareCard,
  abbreviateAddress,
  fmtHf,
  fmtMonthYear,
  fmtSignedUSD,
  fmtUSD,
} from "./shareCard";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const COLORS = {
  page: "#131a25",
  panel: "#1d2432",
  border: "#3b4658",
  text: "#e8eef7",
  dimmed: "#96a3b8",
  brand: "#4d8dff",
  green: "#38d9a9",
  yellow: "#fcc419",
  orange: "#ffa94d",
  red: "#ff6b6b",
  track: "#2a3344",
};

/** Same thresholds as getHealthFactorColor in hooks/useAaveData.ts. */
const hfColor = (hf: number): string =>
  hf < 1.1 ? COLORS.red : hf > 3 ? COLORS.green : COLORS.yellow;

/** Icons resolved by the caller: symbol/network name → SVG data URI. */
export type OgIcons = Record<string, string | null | undefined>;

export type OgContext = {
  i18n: I18n;
  icons: OgIcons;
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** BiGhost from react-icons, inlined (Satori can't run icon components). */
const GhostMark = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2c-4.963 0-9 4.038-9 9v8h.051c.245 1.691 1.69 3 3.449 3 1.174 0 2.074-.417 2.672-1.174a3.99 3.99 0 0 0 5.668-.014c.601.762 1.504 1.188 2.66 1.188 1.93 0 3.5-1.57 3.5-3.5V11c0-4.962-4.037-9-9-9zm7 16.5c0 .827-.673 1.5-1.5 1.5-.449 0-1.5 0-1.5-2v-1h-2v1c0 1.103-.897 2-2 2s-2-.897-2-2v-1H8v1c0 1.845-.774 2-1.5 2-.827 0-1.5-.673-1.5-1.5V11c0-3.86 3.141-7 7-7s7 3.14 7 7v7.5z" />
    <circle cx="9" cy="10" r="2" />
    <circle cx="15" cy="10" r="2" />
  </svg>
);

/** Token/network mark: real icon when resolved, letter circle otherwise. */
const IconCircle = ({
  name,
  dataUri,
  size,
}: {
  name: string;
  dataUri: string | null | undefined;
  size: number;
}) => {
  if (dataUri) {
    return (
      <img
        src={dataUri}
        width={size}
        height={size}
        style={{ borderRadius: size / 2 }}
      />
    );
  }
  // Deterministic hue from the name so fallbacks stay stable per asset.
  const hue =
    [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 45%, 35%)`,
        color: COLORS.text,
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 600,
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
};

const Header = ({ card, ctx }: { card: ShareCard; ctx: OgContext }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <GhostMark size={44} color={COLORS.text} />
      <span
        style={{
          fontFamily: "Space Grotesk",
          fontSize: 30,
          fontWeight: 700,
        }}
      >
        DeFi Simulator
      </span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <IconCircle
        name={card.mt}
        dataUri={ctx.icons[`network:${card.ni}`]}
        size={30}
      />
      <span style={{ fontSize: 24, fontWeight: 600 }}>{`Aave ${card.mt}`}</span>
    </div>
  </div>
);

/** Whose position this is — the identity line every card leads with. */
const OwnerRow = ({ card, label }: { card: ShareCard; label: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "baseline",
      gap: 14,
      marginTop: 22,
    }}
  >
    <span
      style={{
        fontFamily: "JetBrains Mono",
        fontSize: 34,
        color: COLORS.brand,
      }}
    >
      {abbreviateAddress(card.a)}
    </span>
    <span style={{ fontSize: 24, color: COLORS.dimmed }}>·</span>
    <span style={{ fontSize: 24, color: COLORS.dimmed }}>{label}</span>
  </div>
);

const Footer = ({ card, ctx }: { card: ShareCard; ctx: OgContext }) => {
  const { i18n } = ctx;
  const asOf = new Intl.DateTimeFormat(i18n.locale || "en", {
    dateStyle: "medium",
  }).format(new Date(card.asOf * 1000));
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      }}
    >
      <span style={{ fontSize: 22, color: COLORS.dimmed }}>
        {t(i18n)`as of ${asOf}`}
      </span>
      <span style={{ fontSize: 22, color: COLORS.brand, fontWeight: 600 }}>
        defisim.xyz
      </span>
    </div>
  );
};

const SimRibbon = ({ i18n }: { i18n: I18n }) => (
  <div
    style={{
      display: "flex",
      position: "absolute",
      top: 108,
      right: 48,
      padding: "6px 18px",
      borderRadius: 8,
      border: `2px solid ${COLORS.yellow}`,
      color: COLORS.yellow,
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: 3,
    }}
  >
    {t(i18n)`SIMULATED`.toUpperCase()}
  </div>
);

/** Root frame: page bg + tinted radial glow + header/owner/body/footer. */
const Frame = ({
  card,
  ctx,
  glow,
  ownerLabel,
  sim,
  children,
}: {
  card: ShareCard;
  ctx: OgContext;
  glow: string;
  /** what the address owns on this card, e.g. "Aave position" */
  ownerLabel: string;
  sim?: boolean;
  children: ReactElement;
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: COLORS.page,
      backgroundImage: `radial-gradient(circle at 0% 0%, ${glow}, transparent 55%)`,
      color: COLORS.text,
      fontFamily: "Inter",
      padding: 48,
      position: "relative",
    }}
  >
    <Header card={card} ctx={ctx} />
    <OwnerRow card={card} label={ownerLabel} />
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        width: "100%",
      }}
    >
      {children}
    </div>
    <Footer card={card} ctx={ctx} />
    {sim ? <SimRibbon i18n={ctx.i18n} /> : null}
  </div>
);

// ---------------------------------------------------------------------------
// HF gauge (inline SVG arc — Satori supports static SVG)
// ---------------------------------------------------------------------------

const polarPoint = (
  cx: number,
  cy: number,
  radius: number,
  degrees: number,
): [number, number] => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + radius * Math.sin(radians), cy - radius * Math.cos(radians)];
};

const arcPath = (
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string => {
  const [sx, sy] = polarPoint(cx, cy, radius, startDeg);
  const [ex, ey] = polarPoint(cx, cy, radius, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
};

const GAUGE_START = -120;
const GAUGE_END = 120;

/** Map HF to gauge fill: 0.9 → empty, 3.0+ → full (log-ish linear ramp). */
const gaugeFraction = (hf: number): number => {
  if (!Number.isFinite(hf)) return 1;
  return Math.min(1, Math.max(0.02, (hf - 0.9) / (3 - 0.9)));
};

const HfGauge = ({
  hf,
  label,
  size,
}: {
  hf: number;
  label: string;
  size: number;
}) => {
  const stroke = Math.round(size * 0.08);
  const radius = size / 2 - stroke;
  const center = size / 2;
  const fillEnd = GAUGE_START + (GAUGE_END - GAUGE_START) * gaugeFraction(hf);
  const color = hfColor(hf);
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <path
          d={arcPath(center, center, radius, GAUGE_START, GAUGE_END)}
          stroke={COLORS.track}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={arcPath(center, center, radius, GAUGE_START, fillEnd)}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "Space Grotesk",
            fontSize: size * 0.22,
            fontWeight: 700,
            color,
          }}
        >
          {fmtHf(hf)}
        </span>
        <span style={{ fontSize: size * 0.08, color: COLORS.dimmed }}>
          {label}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const Stat = ({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <span
      style={{
        fontSize: 20,
        color: COLORS.dimmed,
        textTransform: "uppercase",
        letterSpacing: 1,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: "Space Grotesk",
        fontSize: 40,
        fontWeight: 700,
        color: color ?? COLORS.text,
      }}
    >
      {value}
    </span>
  </div>
);

const PositionTemplate = ({
  card,
  ctx,
}: {
  card: PositionShareCard;
  ctx: OgContext;
}) => {
  const { i18n } = ctx;
  const locale = i18n.locale;
  const glow =
    hfColor(card.hf) === COLORS.red
      ? "rgba(255, 107, 107, 0.10)"
      : "rgba(56, 217, 169, 0.09)";
  return (
    <Frame
      card={card}
      ctx={ctx}
      glow={glow}
      ownerLabel={t(i18n)`Aave position`}
      sim={card.sim}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          gap: 48,
        }}
      >
        <HfGauge hf={card.hf} label={t(i18n)`Health Factor`} size={280} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 30,
            flexGrow: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 32,
            }}
          >
            <Stat
              label={t(i18n)`Borrowing Power`}
              value={fmtUSD(locale, card.availableUSD, { compact: true })}
              color={COLORS.brand}
            />
            <Stat
              label={t(i18n)`Total Borrowed`}
              value={fmtUSD(locale, card.borrowedUSD, { compact: true })}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 32,
            }}
          >
            <Stat
              label={t(i18n)`Supplied Value`}
              value={fmtUSD(locale, card.suppliedUSD, { compact: true })}
            />
            <Stat
              label={t(i18n)`Net Value`}
              value={fmtUSD(locale, card.netUSD, { compact: true })}
              color={card.netUSD >= 0 ? COLORS.green : COLORS.orange}
            />
          </div>
        </div>
      </div>
    </Frame>
  );
};

const DropRow = ({
  drop,
  ctx,
}: {
  drop: LiquidationShareCard["drops"][number];
  ctx: OgContext;
}) => {
  const locale = ctx.i18n.locale;
  const pct = Math.min(95, Math.max(3, Math.abs(drop.pct)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <IconCircle
        name={drop.s}
        dataUri={ctx.icons[`token:${drop.s}`]}
        size={52}
      />
      <div
        style={{ display: "flex", flexDirection: "column", gap: 6, width: 560 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 30, fontWeight: 600 }}>{drop.s}</span>
          <span
            style={{
              fontFamily: "Space Grotesk",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            {fmtUSD(locale, drop.to)}
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 600,
              color: COLORS.red,
              backgroundColor: "rgba(255, 107, 107, 0.12)",
              padding: "2px 12px",
              borderRadius: 8,
            }}
          >
            −{Math.abs(Math.round(drop.pct))}%
          </span>
        </div>
        {/* current → liquidation price drop bar */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 10,
            backgroundColor: COLORS.track,
            borderRadius: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${pct}%`,
              height: 10,
              backgroundColor: COLORS.red,
              borderRadius: 5,
            }}
          />
        </div>
      </div>
    </div>
  );
};

const LiquidationTemplate = ({
  card,
  ctx,
}: {
  card: LiquidationShareCard;
  ctx: OgContext;
}) => {
  const { i18n } = ctx;
  const shown = card.drops.slice(0, 3);
  const extra = card.drops.length - shown.length;
  return (
    <Frame
      card={card}
      ctx={ctx}
      glow="rgba(255, 107, 107, 0.10)"
      ownerLabel={t(i18n)`Aave liquidation scenario`}
      sim={card.sim}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: 40,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontFamily: "Space Grotesk",
                  fontSize: 42,
                  fontWeight: 700,
                }}
              >
                {t(i18n)`Liquidation risk`}
              </span>
              <span style={{ fontSize: 24, color: COLORS.dimmed }}>
                {t(
                  i18n,
                )`if supplied asset prices drop, the position may be liquidated:`}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {shown.map((drop) => (
                <DropRow key={drop.s} drop={drop} ctx={ctx} />
              ))}
              {extra > 0 ? (
                <span style={{ fontSize: 24, color: COLORS.dimmed }}>
                  {t(i18n)`and ${extra} more`}
                </span>
              ) : null}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* The gauge shows the liquidation point the scenario lands on
              (HF 1.00), not the current HF — the path below gives context. */}
            <HfGauge hf={1} label={t(i18n)`Health Factor`} size={240} />
            <span style={{ fontSize: 26, color: COLORS.dimmed }}>
              {fmtHf(card.hf)} → 1.00
            </span>
          </div>
        </div>
        <span style={{ fontSize: 19, color: COLORS.dimmed, marginTop: 18 }}>
          {t(
            i18n,
          )`One scenario of many: accruing interest, oracle prices, and governance-set risk parameters all shift liquidation risk`}
        </span>
      </div>
    </Frame>
  );
};

const InterestTemplate = ({
  card,
  ctx,
}: {
  card: InterestShareCard;
  ctx: OgContext;
}) => {
  const { i18n } = ctx;
  const locale = i18n.locale;
  const positive = card.net >= 0;
  const netColor = positive ? COLORS.green : COLORS.orange;
  const glow = positive
    ? "rgba(105, 219, 124, 0.09)"
    : "rgba(255, 169, 77, 0.08)";
  const shown = card.top.slice(0, 3);
  const extra = card.top.length - shown.length;
  return (
    <Frame
      card={card}
      ctx={ctx}
      glow={glow}
      ownerLabel={t(i18n)`Aave interest`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 22,
              color: COLORS.dimmed,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {card.since !== null
              ? t(
                  i18n,
                )`Net interest · since ${fmtMonthYear(locale, card.since)}`
              : t(i18n)`Net interest`}
          </span>
          <span
            style={{
              fontFamily: "Space Grotesk",
              fontSize: 118,
              fontWeight: 700,
              color: netColor,
            }}
          >
            {fmtSignedUSD(locale, card.net)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 52 }}>
          <Stat
            label={t(i18n)`Earned`}
            value={fmtUSD(locale, card.earned)}
            color={COLORS.green}
          />
          <Stat
            label={t(i18n)`Paid`}
            value={fmtUSD(locale, card.paid)}
            color={COLORS.orange}
          />
        </div>
        {shown.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {shown.map(([symbol, usd]) => (
              <div
                key={symbol}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 26,
                  padding: "8px 20px 8px 10px",
                }}
              >
                <IconCircle
                  name={symbol}
                  dataUri={ctx.icons[`token:${symbol}`]}
                  size={34}
                />
                <span style={{ fontSize: 24, fontWeight: 600 }}>{symbol}</span>
                <span style={{ fontSize: 24, color: COLORS.dimmed }}>
                  {fmtSignedUSD(locale, usd)}
                </span>
              </div>
            ))}
            {extra > 0 ? (
              <span style={{ fontSize: 24, color: COLORS.dimmed }}>
                {t(i18n)`+${extra} more`}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// Default / address-only card
// ---------------------------------------------------------------------------

/** Branded card for the homepage, unknown snapshots, and pasted URLs.
 * `address`/`marketTitle` (optional) come from the bot-rewrite route. */
export const renderDefaultCard = (
  i18n: I18n,
  { address, marketTitle }: { address?: string; marketTitle?: string } = {},
) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: COLORS.page,
      backgroundImage:
        "radial-gradient(circle at 20% 0%, rgba(77, 141, 255, 0.14), transparent 55%)",
      color: COLORS.text,
      fontFamily: "Inter",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      padding: 48,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <GhostMark size={84} color={COLORS.text} />
      <span
        style={{
          fontFamily: "Space Grotesk",
          fontSize: 64,
          fontWeight: 700,
        }}
      >
        DeFi Simulator
      </span>
    </div>
    {address ? (
      <span
        style={{
          fontFamily: "JetBrains Mono",
          fontSize: 40,
          color: COLORS.brand,
        }}
      >
        {abbreviateAddress(address)}
      </span>
    ) : null}
    <span
      style={{
        fontSize: 28,
        color: COLORS.dimmed,
        textAlign: "center",
        maxWidth: 900,
      }}
    >
      {address
        ? marketTitle
          ? t(i18n)`Aave position simulator · ${marketTitle}`
          : t(i18n)`Aave position simulator`
        : t(
            i18n,
          )`Simulate Aave positions, liquidation scenarios, and on-chain interest`}
    </span>
    <span style={{ fontSize: 24, color: COLORS.dimmed }}>defisim.xyz</span>
  </div>
);

/** Render any share card to its template. */
export const renderCard = (card: ShareCard, ctx: OgContext) => {
  switch (card.k) {
    case "position":
      return <PositionTemplate card={card} ctx={ctx} />;
    case "liq":
      return <LiquidationTemplate card={card} ctx={ctx} />;
    case "interest":
      return <InterestTemplate card={card} ctx={ctx} />;
    default:
      return renderDefaultCard(ctx.i18n);
  }
};
