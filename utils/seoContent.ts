/**
 * Crawlable copy for the two indexable routes, resolved on the server.
 *
 * Why strings-in-props instead of <Trans> in the component: locale activation
 * for the global i18n singleton happens in a client effect
 * (hooks/useAddressFromQuery), so anything rendered with <Trans> during static
 * generation comes out in English for all 63 locales. That is fine for the
 * interactive chrome, which retranslates on hydration, but it would make every
 * localized URL a byte-identical English duplicate — and hreflang annotations
 * pointing at 62 identical pages are worse than none at all.
 *
 * Resolving these strings through a per-locale I18n instance in getStaticProps
 * (the same loadServerI18n the share routes use) means the prerendered HTML is
 * genuinely localized, without inlining a 22KB catalog into __NEXT_DATA__ on
 * every page load.
 */
import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

import type { IndexableRoute } from "./seo";

export type FaqEntry = { question: string; answer: string };

/** Formula blocks render monospaced and centred; prose renders as body copy. */
export type SeoBlock = { kind: "text" | "formula"; text: string };

export type SeoSection = { heading: string; blocks: SeoBlock[] };

export type SeoTableLabels = {
  heading: string;
  intro: string;
  asset: string;
  primary: string;
  secondary: string;
  tertiary: string;
};

export type SeoContent = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: SeoSection[];
  table: SeoTableLabels;
  asOf: string;
  marketsHeading: string;
  marketsIntro: string;
  faqHeading: string;
  faq: FaqEntry[];
};

const text = (value: string): SeoBlock => ({ kind: "text", text: value });
const formula = (value: string): SeoBlock => ({ kind: "formula", text: value });

const simulatorContent = (i18n: I18n): SeoContent => ({
  metaTitle: t(
    i18n,
  )`Aave Liquidation & Health Factor Calculator · DeFi Simulator`,
  metaDescription: t(
    i18n,
  )`Calculate Aave liquidation prices and health factors for any address. Simulate borrows, collateral and price moves across every Aave v3 and v4 market.`,
  h1: t(i18n)`Aave Liquidation Price & Health Factor Calculator`,
  intro: t(
    i18n,
  )`Paste any wallet address to load its live Aave position, then drag the supplied and borrowed amounts — or the asset prices — to see exactly where the position gets liquidated. Nothing is connected and nothing is signed: the simulator only reads public on-chain data.`,
  sections: [
    {
      heading: t(i18n)`How the Aave liquidation price is calculated`,
      blocks: [
        text(
          t(
            i18n,
          )`Aave scores every position with a single number, the health factor. It is the value of your collateral, with each asset weighted by its liquidation threshold, divided by the value of everything you have borrowed:`,
        ),
        formula(
          t(
            i18n,
          )`health factor = (collateral value x liquidation threshold) / borrowed value`,
        ),
        text(
          t(
            i18n,
          )`A position becomes eligible for liquidation the moment its health factor drops below 1.0. Because collateral value moves with the market, the liquidation price is simply the collateral price at which the health factor reaches exactly 1.0.`,
        ),
        text(
          t(
            i18n,
          )`Worked example: you supply 10 ETH at $3,000 (a $30,000 balance) and WETH has a liquidation threshold of 82.5%. Against that you borrow 15,000 USDC. The health factor is 30,000 x 0.825 / 15,000 = 1.65. Solving for the price where 10 x price x 0.825 = 15,000 gives a liquidation price of about $1,818 per ETH — a 39% drawdown from here.`,
        ),
        text(
          t(
            i18n,
          )`Positions holding several collateral assets have no single liquidation price, because each asset carries its own liquidation threshold and any of them can move. The simulator handles that case by solving for the collateral prices that bring the health factor to 1.0 while holding the rest of the position fixed.`,
        ),
      ],
    },
    {
      heading: t(i18n)`Health factor and remaining borrowing power`,
      blocks: [
        text(
          t(
            i18n,
          )`Borrowing power uses a second, stricter parameter: the loan-to-value ratio. Where the liquidation threshold decides when you get liquidated, LTV decides how much you are allowed to borrow in the first place, and it is always the lower of the two.`,
        ),
        formula(
          t(
            i18n,
          )`available to borrow = (collateral value x loan-to-value) - already borrowed`,
        ),
        text(
          t(
            i18n,
          )`Continuing the example above, if WETH has an 80% LTV then $30,000 of collateral supports $24,000 of debt. With 15,000 USDC already drawn, $9,000 of borrowing power is left. Borrow all of it and the health factor falls to 30,000 x 0.825 / 24,000 = 1.03, which leaves almost no room for the price to move.`,
        ),
        text(
          t(
            i18n,
          )`E-Mode changes both numbers. When a position's collateral and debt are highly correlated — ETH against ETH derivatives, or one stablecoin against another — Aave raises the LTV and liquidation threshold for that pair, which lifts both the borrowing power and the liquidation price. The simulator reads each market's live E-Mode categories and applies whichever one the position is actually using.`,
        ),
      ],
    },
    {
      heading: t(i18n)`What liquidation actually costs`,
      blocks: [
        text(
          t(
            i18n,
          )`Liquidation is not a full loss of the position. A liquidator repays part of your debt and takes an equivalent amount of your collateral, plus a bonus — the liquidation penalty — as their incentive. That penalty is set per asset and typically runs from about 5% to 10% of the amount liquidated.`,
        ),
        text(
          t(
            i18n,
          )`Which means the practical cost of being liquidated is the penalty on the liquidated portion, not the whole balance. It also means health factors slightly above 1.0 are dangerous rather than safe: gas spikes, oracle update lag and a fast-moving market can all carry a position through 1.0 before you are able to react.`,
        ),
      ],
    },
  ],
  table: {
    heading: t(i18n)`Live Aave risk parameters by market`,
    intro: t(
      i18n,
    )`The loan-to-value ratio, liquidation threshold and liquidation penalty for each listed asset, read from the Aave pool contracts. These are the exact inputs behind every liquidation price above.`,
    asset: t(i18n)`Asset`,
    primary: t(i18n)`Max LTV`,
    secondary: t(i18n)`Liquidation threshold`,
    tertiary: t(i18n)`Liquidation penalty`,
  },
  asOf: t(i18n)`On-chain parameters as of`,
  marketsHeading: t(i18n)`Supported Aave markets`,
  marketsIntro: t(
    i18n,
  )`Liquidation prices, health factors and borrowing power can be simulated in any of these markets:`,
  faqHeading: t(i18n)`Frequently asked questions`,
  faq: [
    {
      question: t(i18n)`How is the Aave liquidation price calculated?`,
      answer: t(
        i18n,
      )`Take the collateral value, multiply it by the asset's liquidation threshold, and divide by the borrowed value — that is the health factor. The liquidation price is the collateral price that makes this equal 1.0, so it works out to the borrowed value divided by (collateral quantity x liquidation threshold).`,
    },
    {
      question: t(i18n)`At what health factor does Aave liquidate a position?`,
      answer: t(
        i18n,
      )`Below 1.0. At a health factor of 1.0 or above the position is safe from liquidation; the instant it falls under 1.0 any liquidator may repay part of the debt and claim the corresponding collateral plus the liquidation penalty.`,
    },
    {
      question: t(i18n)`What is a safe Aave health factor?`,
      answer: t(
        i18n,
      )`There is no official threshold, but the further above 1.0 the more price movement the position can absorb. A health factor of 2.0 means collateral can roughly halve before liquidation, while 1.1 leaves under 10% of headroom. Volatile collateral warrants far more buffer than a stablecoin-against-stablecoin position.`,
    },
    {
      question: t(i18n)`How much is the Aave liquidation penalty?`,
      answer: t(
        i18n,
      )`It is configured per asset, generally between 5% and 10%, and it applies only to the portion of the debt that gets liquidated rather than the whole position. The live figure for every asset is in the risk parameter table above.`,
    },
    {
      question: t(i18n)`Do I need to connect a wallet?`,
      answer: t(
        i18n,
      )`No. Enter any address or ENS name and the position loads from public on-chain data. There is no wallet connection, no signature and no transaction — the simulator cannot move funds.`,
    },
  ],
});

const interestContent = (i18n: I18n): SeoContent => ({
  metaTitle: t(i18n)`Aave Interest Accrual Calculator · DeFi Simulator`,
  metaDescription: t(
    i18n,
  )`See exactly how much interest an Aave position has earned or owed, reconstructed from on-chain token events, alongside live supply and borrow APYs.`,
  h1: t(i18n)`Aave Interest Accrual Calculator`,
  intro: t(
    i18n,
  )`Aave never reports your lifetime interest — balances simply grow, and deposits and withdrawals blur the picture. Paste an address to get a full accounting of what a position has actually earned and paid, rebuilt event by event from the chain.`,
  sections: [
    {
      heading: t(i18n)`How accrued interest is reconstructed`,
      blocks: [
        text(
          t(
            i18n,
          )`Aave hands you an interest-bearing token for every position: an aToken when you supply, a variable debt token when you borrow. These rebase, so the balance climbs continuously without any transaction. That is convenient to hold and awkward to account for, because the balance alone cannot tell you how much was deposited and how much is interest.`,
        ),
        text(
          t(
            i18n,
          )`Every balance change does emit an event, though, and each one separates the principal moved from the interest applied. Summing the principal across a position's whole history gives the net principal, and the rest of the balance has to be interest:`,
        ),
        formula(t(i18n)`accrued interest = current balance - net principal`),
        text(
          t(
            i18n,
          )`Because supplies, withdrawals, borrows, repayments, aToken transfers, collateral swaps and liquidation seizures all emit one of these events, the identity is exact rather than an estimate. It holds for positions that have been topped up and drawn down dozens of times, which is where APY-based estimates fall apart.`,
        ),
      ],
    },
    {
      heading: t(i18n)`Realized and pending interest`,
      blocks: [
        text(
          t(
            i18n,
          )`Interest is credited to your balance whenever the position is touched. Anything credited by a past event is realized interest; whatever has built up since the most recent event is still pending. Both are real, and the two together are the position's lifetime interest.`,
        ),
        text(
          t(
            i18n,
          )`The distinction matters for record-keeping. Realized interest is anchored to a block and a timestamp, so it can be tied to a date; pending interest is a live number that changes every block until the next interaction.`,
        ),
      ],
    },
    {
      heading: t(i18n)`APR and APY on Aave`,
      blocks: [
        text(
          t(
            i18n,
          )`Aave's pools carry a per-second interest rate. The APR is that rate annualized without compounding, while the APY assumes every second's interest is left in place to earn more:`,
        ),
        formula(
          t(i18n)`APY = (1 + APR / seconds per year) ^ seconds per year - 1`,
        ),
        text(
          t(
            i18n,
          )`The gap widens as rates rise: a 5% APR compounds to about 5.13% APY, whereas a 40% APR reaches roughly 49%. Supply APYs are quoted net of the reserve factor, the share of borrower interest the protocol keeps, which is why suppliers always earn less than borrowers pay.`,
        ),
        text(
          t(
            i18n,
          )`Both rates float with utilization — the fraction of the pool currently borrowed — so they can change block to block. A quoted APY is a snapshot, never a promise, and that is precisely why realized interest has to be reconstructed from events rather than projected from a rate.`,
        ),
      ],
    },
  ],
  table: {
    heading: t(i18n)`Live Aave supply and borrow rates`,
    intro: t(
      i18n,
    )`Current supply and variable borrow APYs per asset, read from the Aave pool contracts. Rates move with utilization, so treat these as a snapshot.`,
    asset: t(i18n)`Asset`,
    primary: t(i18n)`Supply APY`,
    secondary: t(i18n)`Variable borrow APY`,
    tertiary: t(i18n)`Max LTV`,
  },
  asOf: t(i18n)`On-chain rates as of`,
  marketsHeading: t(i18n)`Supported Aave markets`,
  marketsIntro: t(
    i18n,
  )`Interest accrual can be reconstructed for positions in any of these markets:`,
  faqHeading: t(i18n)`Frequently asked questions`,
  faq: [
    {
      question: t(
        i18n,
      )`How do I find out how much interest I've earned on Aave?`,
      answer: t(
        i18n,
      )`Aave's own interface shows current balances and rates, not lifetime totals. Enter your address here and every aToken and debt token event for the position is replayed to produce the exact interest earned and owed, broken down by asset and by date.`,
    },
    {
      question: t(i18n)`Does Aave interest compound?`,
      answer: t(
        i18n,
      )`Yes, continuously. Interest accrues per second and is folded straight into your token balance, so it immediately starts earning as well. That is the difference between the quoted APR and the higher APY.`,
    },
    {
      question: t(
        i18n,
      )`Why is my aToken balance higher than the amount I deposited?`,
      answer: t(
        i18n,
      )`That difference is your accrued interest. aTokens rebase rather than paying out separately, so the balance rises on its own with no transaction and nothing to claim — withdrawing simply takes principal and interest together.`,
    },
    {
      question: t(i18n)`Do I need to connect a wallet to see accrued interest?`,
      answer: t(
        i18n,
      )`No. Everything is derived from public on-chain events, so any address or ENS name works without a wallet connection or signature.`,
    },
  ],
});

export const getSeoContent = (route: IndexableRoute, i18n: I18n): SeoContent =>
  route === "/interest" ? interestContent(i18n) : simulatorContent(i18n);
