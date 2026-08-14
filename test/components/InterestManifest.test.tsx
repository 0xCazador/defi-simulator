import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

// jsdom lacks the browser APIs Mantine's SegmentedControl/Collapse rely on
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

const A_TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
const DEBT_TOKEN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2";
const DAI_A_TOKEN = "0xccccccccccccccccccccccccccccccccccccccc3";
const USER = "0x34aa3f359a9d614239015126635ce7732c18fdf3";

const wethAsset = {
  symbol: "WETH",
  name: "Wrapped Ether",
  aTokenAddress: A_TOKEN,
  priceInUSD: 2000,
};
const usdcAsset = {
  symbol: "USDC",
  name: "USD Coin",
  variableDebtTokenAddress: DEBT_TOKEN,
  priceInUSD: 1,
};
const daiAsset = {
  symbol: "DAI",
  name: "Dai Stablecoin",
  aTokenAddress: DAI_A_TOKEN,
  priceInUSD: 1,
};

const ledgerState = (accruedValue: string) => ({
  isFetching: false,
  fetchError: "",
  data: {
    accruedValue,
    realizedValue: "1",
    pendingValue: "0.5",
    eventCount: 1,
    ledger: [
      {
        action: "Supply",
        principalDelta: "10",
        interestRealized: "1",
        timestamp: 1700000000,
        txHash: "0xdeadbeef",
        blockNumber: 100,
      },
    ],
  },
});

// Mutable so each test can set up the state it needs; reset in beforeEach.
let mockAvailableAssets: any[] = [];
let mockLedgers = new Map<string, any>();
let mockManifest: any = {};

// The lingui macro isn't compiled under jest, so stand in for it: `t` joins
// its template, `Trans` renders its children.
jest.mock("@lingui/macro", () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    typeof strings === "string"
      ? strings
      : strings.reduce(
          (acc, part, index) => acc + part + String(values[index] ?? ""),
          ""
        ),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Plural: ({
    value,
    one,
    other,
    _0,
  }: {
    value: number;
    one: string;
    other: string;
    _0?: string;
  }) => {
    const form = (value === 0 && _0) || (value === 1 ? one : other);
    return <>{form.replace("#", String(value))}</>;
  },
}));

jest.mock("../../hooks/useAaveData", () => ({
  markets: [
    {
      id: "ETHEREUM_V3",
      title: "Ethereum V3",
      explorer: "https://etherscan.io/address/{{ADDRESS}}",
      explorerName: "Etherscan",
    },
  ],
  useAaveData: () => ({
    currentMarket: "ETHEREUM_V3",
    currentAddress: USER,
    addressData: {
      ETHEREUM_V3: {
        isFetching: false,
        resolvedAddress: USER,
        availableAssets: mockAvailableAssets,
        fetchedData: {
          userReservesData: [{ asset: wethAsset }],
          userBorrowsData: [{ asset: usdcAsset }],
        },
      },
    },
  }),
}));

jest.mock("../../hooks/useAccrualLedger", () => ({
  getPositionKey: (tokenAddress: string, side: string) =>
    `${tokenAddress}:${side}`.toLowerCase(),
  useAccrualLedgers: () => mockLedgers,
  useAccrualManifest: () => mockManifest,
}));

jest.mock("../../components/LocalizedFiatDisplay", () => ({
  __esModule: true,
  default: ({ valueUSD }: { valueUSD: number }) => <span>${valueUSD}</span>,
}));

jest.mock("../../components/TokenIcon", () => ({
  __esModule: true,
  default: () => <span />,
}));

// eslint-disable-next-line import/first
import InterestManifest from "../../components/InterestManifest";

const renderPage = () => {
  i18n.load("en", {});
  i18n.activate("en");
  return render(
    <I18nProvider i18n={i18n}>
      <MantineProvider>
        <InterestManifest />
      </MantineProvider>
    </I18nProvider>
  );
};

/** Adds a closed DAI supply position, as a completed full-history scan would */
const withCompletedScan = () => {
  mockAvailableAssets = [daiAsset];
  mockLedgers.set(`${DAI_A_TOKEN}:supply`, ledgerState("5"));
  mockManifest = {
    ...mockManifest,
    results: [
      {
        symbol: "DAI",
        side: "supply",
        tokenAddress: DAI_A_TOKEN,
        data: { eventCount: 3 },
      },
    ],
  };
};

describe("InterestManifest", () => {
  beforeEach(() => {
    mockAvailableAssets = [];
    mockLedgers = new Map<string, any>([
      [`${A_TOKEN}:supply`, ledgerState("1.5")],
      [`${DEBT_TOKEN}:borrow`, ledgerState("20")],
    ]);
    mockManifest = {
      isScanning: false,
      scanError: "",
      progress: { done: 0, total: 0 },
      results: undefined,
      startScan: jest.fn(),
    };
  });

  it("totals interest across current positions in the summary", () => {
    renderPage();
    // earned = 1.5 WETH * $2000, paid = 20 USDC * $1, net = 2980.
    // Each total also appears on its own asset row, hence two matches.
    expect(screen.getAllByText("$3000")).toHaveLength(2);
    expect(screen.getAllByText("$20")).toHaveLength(2);
    expect(screen.getByText("$2980")).toBeTruthy();
  });

  it("rolls every asset up by default and reveals its ledger on click", () => {
    const { container } = renderPage();
    const headers = () =>
      screen
        .getAllByRole("button")
        .filter((el) => el.hasAttribute("aria-expanded"));

    expect(headers()).toHaveLength(2);
    expect(
      headers().every((el) => el.getAttribute("aria-expanded") === "false")
    ).toBe(true);
    expect(container.querySelectorAll("table")).toHaveLength(0);

    fireEvent.click(headers()[0]);
    expect(headers()[0].getAttribute("aria-expanded")).toBe("true");
    expect(headers()[1].getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll("table")).toHaveLength(1);
  });

  it("expands and collapses every asset with the bulk control", () => {
    const { container } = renderPage();
    const headers = () =>
      screen
        .getAllByRole("button")
        .filter((el) => el.hasAttribute("aria-expanded"));

    fireEvent.click(screen.getByText("Expand all"));
    expect(
      headers().every((el) => el.getAttribute("aria-expanded") === "true")
    ).toBe(true);
    expect(container.querySelectorAll("table")).toHaveLength(2);

    fireEvent.click(screen.getByText("Collapse all"));
    expect(
      headers().every((el) => el.getAttribute("aria-expanded") === "false")
    ).toBe(true);
  });

  it("shows the scope note and a deep-scan control in the summary", () => {
    const { container } = renderPage();
    expect(container.textContent).toContain(
      "Interest from assets that have since been fully withdrawn or repaid is not included."
    );
    expect(screen.getByText("Scan past assets")).toBeTruthy();
  });

  it("folds past assets into the totals once the full scan has run", () => {
    withCompletedScan();
    const { container } = renderPage();

    // earned now adds the closed DAI position: 1.5 WETH * $2000 + 5 DAI * $1
    expect(screen.getAllByText("$3005")).toHaveLength(1);
    expect(screen.getByText("$2985")).toBeTruthy();

    expect(container.textContent).toContain(
      "including 1 position that has since been closed"
    );
    expect(container.textContent?.includes("is not included.")).toBe(false);
    expect(screen.queryByText("Scan past assets")).toBeNull();
  });
});
