/**
 * Client-side share payload builders: turn live app state into the
 * self-contained ShareCard snapshots defined in shareCard.ts.
 *
 * Kept separate from shareCard.ts on purpose — these need the markets config
 * from useAaveData (ethers, address-book), which must never be pulled into
 * the OG image function or middleware.
 */
import type { ImmutableObject } from "@hookstate/core";

import {
  AaveMarketDataType,
  AssetDetails,
  HealthFactorData,
  getIconNameFromMarket,
} from "../hooks/useAaveData";
import {
  InterestShareCard,
  LiquidationShareCard,
  PositionShareCard,
  SHARE_CARD_VERSION,
  SharePayload,
  MAX_LIST_ITEMS,
  buildExpect,
  diffSimOps,
  toStoredHf,
} from "./shareCard";

type MarketMeta = { m: string; mt: string; ni: string };

const marketMeta = (market: AaveMarketDataType): MarketMeta => ({
  m: market.id,
  mt: market.title,
  ni: getIconNameFromMarket(market),
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Deep-clone hookstate immutables into plain JSON for the diff helpers. */
const plain = <T>(value: ImmutableObject<T> | undefined): T | undefined =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export const buildPositionPayload = (
  data: ImmutableObject<HealthFactorData>,
  market: AaveMarketDataType,
  address: string,
): SharePayload => {
  const fetched = plain(data.fetchedData);
  const working = plain(data.workingData);
  const simOps = diffSimOps(fetched, working);

  const suppliedUSD =
    working?.userReservesData.reduce(
      (acc, item) => acc + item.underlyingBalanceUSD,
      0,
    ) ?? 0;
  const borrowedUSD = working?.totalBorrowsUSD ?? 0;

  const card: PositionShareCard = {
    v: SHARE_CARD_VERSION,
    k: "position",
    a: address,
    ...marketMeta(market),
    asOf: nowSeconds(),
    // Read HF from the live immutable, not the JSON clone: Infinity (no
    // debt) becomes null under JSON and would display as 0.00.
    hf: toStoredHf(data.workingData?.healthFactor),
    sim: simOps.length > 0,
    borrowedUSD,
    availableUSD: Math.max(working?.availableBorrowsUSD ?? 0, 0),
    suppliedUSD,
    netUSD: suppliedUSD - borrowedUSD,
  };

  const payload: SharePayload = {
    card,
    expect: buildExpect(fetched, working),
  };
  if (simOps.length) payload.simOps = simOps;
  return payload;
};

export const buildLiquidationPayload = (
  data: ImmutableObject<HealthFactorData>,
  scenario: AssetDetails[],
  market: AaveMarketDataType,
  address: string,
): SharePayload => {
  const fetched = plain(data.fetchedData);
  const working = plain(data.workingData);
  const simOps = diffSimOps(fetched, working);

  const drops = scenario
    .map((asset) => {
      const from = asset.initialPriceInUSD;
      const to = asset.priceInUSD;
      const pct = from > 0 ? ((to - from) / from) * 100 : 0;
      return { s: asset.symbol, from, to, pct };
    })
    // Largest relative drops first: they carry the story.
    .sort((a, b) => a.pct - b.pct)
    .slice(0, MAX_LIST_ITEMS);

  const card: LiquidationShareCard = {
    v: SHARE_CARD_VERSION,
    k: "liq",
    a: address,
    ...marketMeta(market),
    asOf: nowSeconds(),
    hf: toStoredHf(data.workingData?.healthFactor),
    sim: simOps.length > 0,
    drops,
  };

  const payload: SharePayload = {
    card,
    expect: buildExpect(
      fetched,
      working,
      drops.map((drop) => drop.s),
    ),
  };
  if (simOps.length) payload.simOps = simOps;
  return payload;
};

export const buildInterestPayload = (
  {
    net,
    earned,
    paid,
    since,
    top,
  }: {
    net: number;
    earned: number;
    paid: number;
    since: number | null;
    top: [string, number][];
  },
  market: AaveMarketDataType,
  address: string,
): SharePayload => {
  const card: InterestShareCard = {
    v: SHARE_CARD_VERSION,
    k: "interest",
    a: address,
    ...marketMeta(market),
    asOf: nowSeconds(),
    net,
    earned,
    paid,
    since,
    top: top.slice(0, MAX_LIST_ITEMS),
  };
  // Interest cards are read-only history: no sim ops, no expectations —
  // click-through simply reloads the live manifest.
  return { card };
};
