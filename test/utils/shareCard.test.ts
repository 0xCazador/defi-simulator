import { setupI18n } from "@lingui/core";

// The SWC jest transformer doesn't expand Lingui macros; mirror the repo
// convention and mock them. Supports both t`...` and the bound t(i18n)`...`
// form used by the share copy helpers (values are pre-formatted via Intl, so
// plain interpolation matches the compiled English output).
jest.mock("@lingui/core/macro", () => ({
  t: (first: unknown, ...rest: unknown[]) => {
    const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (acc, part, index) => acc + part + String(values[index] ?? ""),
        "",
      );
    if (Array.isArray(first))
      return interpolate(first as unknown as TemplateStringsArray, ...rest);
    return interpolate; // bound form: t(i18n)`...`
  },
}));

import {
  InterestShareCard,
  LiquidationShareCard,
  LiveState,
  PositionShareCard,
  ReplayResult,
  SHARE_CARD_VERSION,
  SharePayload,
  buildExpect,
  checkReproduction,
  decodeInlinePayload,
  diffSimOps,
  encodeInlinePayload,
  getShareDescription,
  getShareTitle,
  getShareTweet,
  validateSharePayload,
} from "../../utils/shareCard";
import type { AaveHealthFactorData } from "../../hooks/useAaveData";

const en = setupI18n({ locale: "en", messages: { en: {} } });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseCard = {
  v: SHARE_CARD_VERSION,
  a: "0x1111111111111111111111111111111111111111",
  m: "ETHEREUM_V3",
  mt: "Ethereum v3",
  ni: "ethereum",
  asOf: 1_750_000_000,
} as const;

const positionCard: PositionShareCard = {
  ...baseCard,
  k: "position",
  hf: 1.84,
  sim: false,
  borrowedUSD: 500_000,
  availableUSD: 2_100_000,
  suppliedUSD: 3_000_000,
  netUSD: 2_500_000,
};

const liqCard: LiquidationShareCard = {
  ...baseCard,
  k: "liq",
  hf: 1.24,
  sim: true,
  drops: [
    { s: "WBTC", from: 65_000, to: 41_200, pct: -36.6 },
    { s: "WETH", from: 3_200, to: 1_850, pct: -42.2 },
  ],
};

const interestCard: InterestShareCard = {
  ...baseCard,
  k: "interest",
  net: 12_482,
  earned: 15_000,
  paid: 2_518,
  since: 1_705_276_800, // Jan 15, 2024 (mid-month: TZ-proof for the tests)
  top: [
    ["USDC", 9_000],
    ["WETH", 4_000],
  ],
};

type ReserveFixture = [
  symbol: string,
  quantity: number,
  price?: number,
  collateral?: boolean,
];
type BorrowFixture = [symbol: string, quantity: number, price?: number];

const makeHfData = (
  reserves: ReserveFixture[],
  borrows: BorrowFixture[],
  healthFactor = 2,
): AaveHealthFactorData =>
  ({
    healthFactor,
    userReservesData: reserves.map(
      ([symbol, quantity, price = 100, collateral = true]) => ({
        asset: { symbol, priceInUSD: price, initialPriceInUSD: price },
        underlyingBalance: quantity,
        underlyingBalanceUSD: quantity * price,
        usageAsCollateralEnabledOnUser: collateral,
      }),
    ),
    userBorrowsData: borrows.map(([symbol, quantity, price = 100]) => ({
      asset: { symbol, priceInUSD: price, initialPriceInUSD: price },
      totalBorrows: quantity,
      totalBorrowsUSD: quantity * price,
    })),
  }) as unknown as AaveHealthFactorData;

const cleanReplay: ReplayResult = {
  applied: 0,
  skipped: 0,
  skippedSymbols: [],
};

const makeLive = (
  fetched: AaveHealthFactorData,
  working: AaveHealthFactorData,
  marketExists = true,
): LiveState => ({
  healthFactor: working.healthFactor,
  reserves: working.userReservesData.map((item) => ({
    symbol: item.asset.symbol,
    quantity: item.underlyingBalance,
    priceInUSD: item.asset.priceInUSD,
  })),
  borrows: working.userBorrowsData.map((item) => ({
    symbol: item.asset.symbol,
    quantity: item.totalBorrows,
    priceInUSD: item.asset.priceInUSD,
  })),
  marketExists,
  fetchedReserves: fetched.userReservesData.map((item) => ({
    symbol: item.asset.symbol,
    quantity: item.underlyingBalance,
  })),
  fetchedBorrows: fetched.userBorrowsData.map((item) => ({
    symbol: item.asset.symbol,
    quantity: item.totalBorrows,
  })),
});

// ---------------------------------------------------------------------------
// validateSharePayload
// ---------------------------------------------------------------------------

describe("validateSharePayload", () => {
  it("accepts all three card kinds", () => {
    expect(validateSharePayload({ card: positionCard })).toBeTruthy();
    expect(validateSharePayload({ card: liqCard })).toBeTruthy();
    expect(validateSharePayload({ card: interestCard })).toBeTruthy();
  });

  it("accepts ENS-style addresses", () => {
    const card = { ...positionCard, a: "stani.eth" };
    expect(validateSharePayload({ card })).toBeTruthy();
  });

  it("rejects unknown versions and kinds", () => {
    expect(
      validateSharePayload({ card: { ...positionCard, v: 99 } }),
    ).toBeNull();
    expect(
      validateSharePayload({ card: { ...positionCard, k: "wat" } }),
    ).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(validateSharePayload(null)).toBeNull();
    expect(validateSharePayload("string")).toBeNull();
    expect(
      validateSharePayload({ card: { ...positionCard, hf: "1.84" } }),
    ).toBeNull();
    expect(
      validateSharePayload({ card: { ...positionCard, a: "<script>" } }),
    ).toBeNull();
    expect(
      validateSharePayload({ card: { ...liqCard, drops: [] } }),
    ).toBeNull();
    expect(
      validateSharePayload({
        card: { ...liqCard, drops: [{ s: "X", from: NaN, to: 1, pct: 1 }] },
      }),
    ).toBeNull();
  });

  it("enforces list and op clamps", () => {
    const tooManyDrops = {
      ...liqCard,
      drops: Array.from({ length: 7 }, (_, index) => ({
        s: `A${index}`,
        from: 1,
        to: 1,
        pct: 1,
      })),
    };
    expect(validateSharePayload({ card: tooManyDrops })).toBeNull();

    const tooManyOps = {
      card: positionCard,
      simOps: Array.from({ length: 101 }, () => ({
        op: "price",
        s: "WETH",
        n: 1,
      })),
    };
    expect(validateSharePayload(tooManyOps)).toBeNull();
  });

  it("validates simOps and expect blocks", () => {
    const payload: SharePayload = {
      card: positionCard,
      simOps: [
        { op: "addBorrow", s: "GHO" },
        { op: "borrowQty", s: "GHO", n: 1000 },
        { op: "collateral", s: "WETH", on: false },
      ],
      expect: {
        hf: 1.84,
        positions: [["WETH", "s", 10]],
        prices: [["WETH", 3200]],
      },
    };
    expect(validateSharePayload(payload)).toEqual(payload);
    expect(
      validateSharePayload({
        card: positionCard,
        simOps: [{ op: "hack", s: "X" }],
      }),
    ).toBeNull();
    expect(
      validateSharePayload({
        card: positionCard,
        expect: { positions: [["WETH", "x", 10]] },
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inline encode/decode
// ---------------------------------------------------------------------------

describe("inline payload encoding", () => {
  it("round-trips a payload", () => {
    const payload: SharePayload = {
      card: liqCard,
      simOps: [{ op: "reserveQty", s: "WETH", n: 12.5 }],
      expect: { positions: [["WETH", "s", 12.5]] },
    };
    const encoded = encodeInlinePayload(payload);
    expect(encoded).not.toMatch(/[+/=]/); // base64url-safe
    expect(decodeInlinePayload(encoded)).toEqual(payload);
  });

  it("returns null for garbage and tampered input", () => {
    expect(decodeInlinePayload("not-base64!!!")).toBeNull();
    const encoded = encodeInlinePayload({ card: positionCard });
    expect(decodeInlinePayload(`${encoded.slice(0, -4)}XXXX`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// diffSimOps
// ---------------------------------------------------------------------------

describe("diffSimOps", () => {
  it("returns no ops for identical data", () => {
    const fetched = makeHfData([["WETH", 10]], [["USDC", 500]]);
    const working = makeHfData([["WETH", 10]], [["USDC", 500]]);
    expect(diffSimOps(fetched, working)).toEqual([]);
  });

  it("captures quantity edits", () => {
    const fetched = makeHfData([["WETH", 10]], [["USDC", 500]]);
    const working = makeHfData([["WETH", 25]], [["USDC", 500]]);
    expect(diffSimOps(fetched, working)).toEqual([
      { op: "reserveQty", s: "WETH", n: 25 },
    ]);
  });

  it("captures added assets with their quantities", () => {
    const fetched = makeHfData([["WETH", 10]], []);
    const working = makeHfData([["WETH", 10]], [["GHO", 1000]]);
    expect(diffSimOps(fetched, working)).toEqual([
      { op: "addBorrow", s: "GHO" },
      { op: "borrowQty", s: "GHO", n: 1000 },
    ]);
  });

  it("captures removals", () => {
    const fetched = makeHfData(
      [
        ["WETH", 10],
        ["WBTC", 2],
      ],
      [],
    );
    const working = makeHfData([["WETH", 10]], []);
    expect(diffSimOps(fetched, working)).toEqual([
      { op: "removeAsset", s: "WBTC", t: "RESERVE" },
    ]);
  });

  it("captures price edits once per symbol", () => {
    const fetched = makeHfData([["WETH", 10, 3200]], [["WETH", 1, 3200]]);
    const working = makeHfData([["WETH", 10, 1850]], [["WETH", 1, 1850]]);
    expect(diffSimOps(fetched, working)).toEqual([
      { op: "price", s: "WETH", n: 1850 },
    ]);
  });

  it("captures collateral toggles", () => {
    const fetched = makeHfData([["WETH", 10, 100, true]], []);
    const working = makeHfData([["WETH", 10, 100, false]], []);
    expect(diffSimOps(fetched, working)).toEqual([
      { op: "collateral", s: "WETH", on: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildExpect + checkReproduction
// ---------------------------------------------------------------------------

describe("checkReproduction", () => {
  const fetched = makeHfData([["WETH", 10, 3200]], [["USDC", 5000, 1]], 1.84);

  it("reports reproduced when nothing changed", () => {
    const expected = buildExpect(fetched, fetched, ["WETH"]);
    const live = makeLive(fetched, fetched);
    expect(checkReproduction(expected, live, cleanReplay)).toEqual({
      status: "reproduced",
    });
  });

  it("tolerates small interest-driven balance drift", () => {
    const expected = buildExpect(fetched, fetched, []);
    const drifted = makeHfData(
      [["WETH", 10.004, 3200]],
      [["USDC", 5001, 1]],
      1.84,
    );
    const live = makeLive(drifted, drifted);
    expect(checkReproduction(expected, live, cleanReplay).status).toBe(
      "reproduced",
    );
  });

  it("classifies a changed position", () => {
    const expected = buildExpect(fetched, fetched, []);
    const changed = makeHfData([["WETH", 4, 3200]], [["USDC", 5000, 1]], 3.1);
    const live = makeLive(changed, changed);
    const result = checkReproduction(expected, live, cleanReplay);
    expect(result.status).toBe("diverged");
    if (result.status === "diverged") {
      expect(result.causes[0].kind).toBe("position-changed");
    }
  });

  it("classifies skipped edits", () => {
    const expected = buildExpect(fetched, fetched, []);
    const live = makeLive(fetched, fetched);
    const replay: ReplayResult = {
      applied: 2,
      skipped: 1,
      skippedSymbols: ["OLDTOKEN"],
    };
    const result = checkReproduction(expected, live, replay);
    expect(result.status).toBe("diverged");
    if (result.status === "diverged") {
      expect(result.causes).toContainEqual({
        kind: "edits-skipped",
        count: 1,
        symbols: ["OLDTOKEN"],
      });
    }
  });

  it("classifies moved market conditions with price deltas", () => {
    const expected = buildExpect(fetched, fetched, ["WETH"]);
    const moved = makeHfData([["WETH", 10, 2400]], [["USDC", 5000, 1]], 1.41);
    const live = makeLive(moved, moved);
    const result = checkReproduction(expected, live, cleanReplay);
    expect(result.status).toBe("diverged");
    if (result.status === "diverged") {
      expect(result.causes[0]).toEqual({
        kind: "conditions-moved",
        liveHf: 1.41,
        expectedHf: 1.84,
        priceDeltas: [{ s: "WETH", from: 3200, to: 2400 }],
      });
    }
  });

  it("reports position-gone when the position was closed", () => {
    const expected = buildExpect(fetched, fetched, []);
    const empty = makeHfData([], [], -1);
    const live = makeLive(empty, empty);
    expect(checkReproduction(expected, live, cleanReplay)).toEqual({
      status: "not-reproducible",
      reason: "position-gone",
    });
  });

  it("reports market-gone when the market no longer exists", () => {
    const expected = buildExpect(fetched, fetched, []);
    const live = makeLive(fetched, fetched, false);
    expect(checkReproduction(expected, live, cleanReplay)).toEqual({
      status: "not-reproducible",
      reason: "market-gone",
    });
  });
});

// ---------------------------------------------------------------------------
// Localized copy helpers
// ---------------------------------------------------------------------------

describe("infinite health factor handling", () => {
  // eslint-disable-next-line global-require
  const {
    toStoredHf,
    HF_INFINITY_SENTINEL,
    fmtHf,
  } = require("../../utils/shareCard");

  it("stores Infinity as a JSON-safe sentinel", () => {
    expect(toStoredHf(Infinity)).toBe(HF_INFINITY_SENTINEL);
    expect(toStoredHf(undefined)).toBe(0);
    expect(toStoredHf(NaN)).toBe(0);
    expect(toStoredHf(1.84)).toBe(1.84);
  });

  it("renders the sentinel and Infinity as ∞", () => {
    expect(fmtHf(HF_INFINITY_SENTINEL)).toBe("∞");
    expect(fmtHf(Infinity)).toBe("∞");
    expect(fmtHf(1.84)).toBe("1.84");
  });

  it("keeps sentinel cards valid and titled with ∞", () => {
    const card = { ...positionCard, hf: HF_INFINITY_SENTINEL };
    expect(validateSharePayload({ card })).toBeTruthy();
    expect(getShareTitle(card, en)).toContain("HF ∞");
  });
});

describe("share copy helpers", () => {
  it("builds a position title with compact borrowing power", () => {
    const title = getShareTitle(positionCard, en);
    expect(title).toBe("HF 1.84 with $2.1M borrowing power");
  });

  it("marks simulated position titles", () => {
    const title = getShareTitle({ ...positionCard, sim: true }, en);
    expect(title).toMatch(/^Simulated: /);
  });

  it("builds a liquidation title from the drops", () => {
    const title = getShareTitle(liqCard, en);
    expect(title).toBe("Liquidated if WBTC → $41.2K and WETH → $1.9K");
  });

  it("builds an interest title with a since date", () => {
    const title = getShareTitle(interestCard, en);
    expect(title).toBe("+$12,482 net Aave interest since Jan 2024");
  });

  it("describes liquidation with percentages and HF path", () => {
    const description = getShareDescription(liqCard, en);
    expect(description).toContain("WBTC drops 37% to $41,200");
    expect(description).toContain("WETH drops 42% to $1,850");
    expect(description).toContain("HF 1.24 → 1.00");
    expect(description).toContain("Simulated position");
    expect(description).toContain("Ethereum v3");
  });

  it("abbreviates 0x addresses in descriptions", () => {
    const description = getShareDescription(positionCard, en);
    expect(description).toContain("0x1111…1111");
  });

  it("builds tweets that include the headline", () => {
    expect(getShareTweet(interestCard, en)).toContain(
      "+$12,482 net Aave interest",
    );
    expect(getShareTweet(liqCard, en)).toContain("could be liquidated");
  });
});
