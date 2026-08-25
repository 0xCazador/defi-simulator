import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import fetchMock from "jest-fetch-mock";

import ShareButton from "../../components/ShareButton";
import {
  SHARE_CARD_VERSION,
  SharePayload,
  LiquidationShareCard,
} from "../../utils/shareCard";

const mockRouter = {
  locale: "en",
};

jest.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@lingui/core/macro", () => ({
  t: (first: unknown, ...rest: unknown[]) => {
    const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (acc, part, index) => acc + part + String(values[index] ?? ""),
        "",
      );
    if (Array.isArray(first))
      return interpolate(first as TemplateStringsArray, ...rest);
    return interpolate; // bound form: t(i18n)`...`
  },
}));
jest.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../../utils/shareCard", () => {
  const actual = jest.requireActual("../../utils/shareCard");
  return {
    ...actual,
    getShareTweet: () => "tweet",
  };
});

(global as any).ResizeObserver = class {
  observe() {}

  unobserve() {}

  disconnect() {}
};
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

const ethCard: LiquidationShareCard = {
  v: SHARE_CARD_VERSION,
  k: "liq",
  a: "0xb7fb2b774eb5e2dad9c060fb367acbdc7fa7099b",
  m: "ETHEREUM_V3",
  mt: "Ethereum v3",
  ni: "ethereum",
  asOf: 1_750_000_000,
  hf: 1.24,
  sim: false,
  drops: [{ s: "WETH", from: 3_200, to: 1_850, pct: -42.2 }],
};

const arbCard: LiquidationShareCard = {
  ...ethCard,
  m: "ARBITRUM_V3",
  mt: "Arbitrum v3",
  ni: "arbitrum",
};

const payloadFor = (card: LiquidationShareCard): SharePayload => ({ card });

const sharePosts = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes("/api/share") &&
      (init as RequestInit | undefined)?.method === "POST",
  );

const postedMarket = (call: (typeof fetchMock.mock.calls)[number]) =>
  JSON.parse(String(call[1]?.body)).card.m as string;

const renderShareButton = (buildPayload: () => SharePayload | null) => {
  i18n.load("en", {});
  i18n.activate("en");
  return render(
    <I18nProvider i18n={i18n}>
      <MantineProvider>
        <ShareButton
          label="Share liquidation scenario"
          buildPayload={buildPayload}
        />
      </MantineProvider>
    </I18nProvider>,
  );
};

describe("ShareButton", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const id = body.card?.m === "ARBITRUM_V3" ? "arbShare" : "ethShare";
      return JSON.stringify({ id });
    });
  });

  it("remints when the card market changes instead of reusing the first snapshot", async () => {
    const user = userEvent.setup();
    let card = ethCard;
    renderShareButton(() => payloadFor(card));

    const trigger = screen.getByRole("button", {
      name: "Share liquidation scenario",
    });

    await user.click(trigger);
    await waitFor(() => expect(sharePosts()).toHaveLength(1));
    expect(postedMarket(sharePosts()[0])).toBe("ETHEREUM_V3");
    await screen.findByText(/\/s\/ethShare/);

    // Close, switch the live market, reopen — must mint an Arbitrum card.
    await user.click(trigger);
    card = arbCard;
    await user.click(trigger);

    await waitFor(() => {
      expect(sharePosts()).toHaveLength(2);
      expect(postedMarket(sharePosts()[1])).toBe("ARBITRUM_V3");
    });
  });

  it("does not remint when the snapshot has not changed", async () => {
    const user = userEvent.setup();
    renderShareButton(() => payloadFor(ethCard));

    const trigger = screen.getByRole("button", {
      name: "Share liquidation scenario",
    });

    await user.click(trigger);
    await waitFor(() => expect(sharePosts()).toHaveLength(1));
    await screen.findByText(/\/s\/ethShare/);

    await user.click(trigger);
    await user.click(trigger);

    await waitFor(() => screen.findByText(/\/s\/ethShare/));
    expect(sharePosts()).toHaveLength(1);
  });
});
