import { ethers } from "ethers";
import {
  resetAccrualCaches,
  scanPositions,
} from "../../pages/api/aave/accrual";
import { AaveMarketDataType } from "../../hooks/useAaveData";

// The scan builds its own provider and token contracts, so replace both.
// ethers.utils stays real: the scan encodes/decodes real event topics.
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn(),
      providers: {
        ...actual.ethers.providers,
        StaticJsonRpcProvider: jest.fn(),
      },
    },
  };
});

const real = jest.requireActual("ethers").ethers;

const TOKEN_ABI = [
  "event Mint(address indexed caller, address indexed onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Burn(address indexed from, address indexed target, uint256 value, uint256 balanceIncrease, uint256 index)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
const iface = new real.utils.Interface(TOKEN_ABI);

const LATEST_BLOCK = 20_000_000;
const USER = "0x0000000000000000000000000000000000000001";
const OTHER = "0x00000000000000000000000000000000000000ff";
const A_WETH = "0x000000000000000000000000000000000000aaa1";
const A_USDC = "0x000000000000000000000000000000000000aaa2";
const DEBT_USDC = "0x000000000000000000000000000000000000bbb1";

const market: AaveMarketDataType = {
  v3: true,
  id: "TEST_V3",
  title: "Test v3",
  chainId: 1 as AaveMarketDataType["chainId"],
  api: "https://example.invalid/rpc",
  addresses: {
    LENDING_POOL_ADDRESS_PROVIDER: A_WETH,
    UI_POOL_DATA_PROVIDER: A_WETH,
  },
  explorer: "https://example.invalid/address/{{ADDRESS}}",
  explorerName: "Test",
  startBlock: 1_000_000,
};

type FakeLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
};

/** Build a real ABI-encoded log so the scan's own parseLog does the decoding. */
const mintLog = (
  address: string,
  onBehalfOf: string,
  value: string,
  balanceIncrease: string,
  blockNumber: number,
  logIndex = 0,
): FakeLog => {
  const { data, topics } = iface.encodeEventLog(iface.getEvent("Mint"), [
    onBehalfOf,
    onBehalfOf,
    value,
    balanceIncrease,
    "0",
  ]);
  return {
    address,
    topics,
    data,
    blockNumber,
    logIndex,
    transactionHash: `0xtx-${address}-${blockNumber}-${logIndex}`,
  };
};

const transferLog = (
  address: string,
  from: string,
  to: string,
  value: string,
  blockNumber: number,
  logIndex = 0,
): FakeLog => {
  const { data, topics } = iface.encodeEventLog(iface.getEvent("Transfer"), [
    from,
    to,
    value,
  ]);
  return {
    address,
    topics,
    data,
    blockNumber,
    logIndex,
    transactionHash: `0xtx-${address}-${blockNumber}-${logIndex}`,
  };
};

/** Matches eth_getLogs semantics: address may be one or a set, each topic slot
 *  may be absent (wildcard), one value, or any-of a set. */
const matches = (log: FakeLog, filter: any): boolean => {
  const addresses = (
    Array.isArray(filter.address) ? filter.address : [filter.address]
  ).map((a: string) => a.toLowerCase());
  if (!addresses.includes(log.address.toLowerCase())) return false;
  return (filter.topics ?? []).every((slot: any, index: number) => {
    if (slot === null || slot === undefined) return true;
    const options = (Array.isArray(slot) ? slot : [slot]).map((t: string) =>
      t.toLowerCase(),
    );
    return options.includes((log.topics[index] ?? "").toLowerCase());
  });
};

const stubChain = (logs: FakeLog[], balances: Record<string, string> = {}) => {
  const sends: any[] = [];
  const blockRequests: number[] = [];
  const balanceCalls: string[] = [];
  const decimalsCalls: string[] = [];

  (
    ethers.providers.StaticJsonRpcProvider as unknown as jest.Mock
  ).mockImplementation(() => ({
    getBlockNumber: async () => LATEST_BLOCK,
    getBlock: async (blockNumber: number) => {
      blockRequests.push(blockNumber);
      return { timestamp: 1_700_000_000 + blockNumber };
    },
    send: async (_method: string, params: any[]) => {
      sends.push(params[0]);
      return logs.filter((log) => matches(log, params[0]));
    },
  }));

  (ethers.Contract as unknown as jest.Mock).mockImplementation(
    (address: string) => ({
      balanceOf: async () => {
        balanceCalls.push(address.toLowerCase());
        return real.BigNumber.from(balances[address.toLowerCase()] ?? "0");
      },
      decimals: async () => {
        decimalsCalls.push(address.toLowerCase());
        return 18;
      },
    }),
  );

  return { sends, blockRequests, balanceCalls, decimalsCalls };
};

beforeEach(() => {
  jest.clearAllMocks();
  // Block timestamps and token decimals are cached for the life of the page,
  // so each test starts from a cold cache to observe the requests it makes.
  resetAccrualCaches();
});

describe("batched position scan", () => {
  it("covers every position in a fixed number of log queries", async () => {
    const { sends } = stubChain([]);
    const positions = [
      { tokenAddress: A_WETH, side: "supply" as const },
      { tokenAddress: A_USDC, side: "supply" as const },
      { tokenAddress: DEBT_USDC, side: "borrow" as const },
    ];

    await scanPositions(market, USER, positions, true);

    // Mint and Burn across all three contracts, Transfer in/out across the
    // two supply-side contracts: four requests, not four per position.
    expect(sends).toHaveLength(4);
    sends.forEach((filter) => {
      expect(filter.fromBlock).toBe(ethers.utils.hexValue(1_000_000));
      expect(filter.toBlock).toBe(ethers.utils.hexValue(LATEST_BLOCK));
    });

    const addressSets = sends.map((filter) =>
      (Array.isArray(filter.address) ? filter.address : [filter.address])
        .map((a: string) => a.toLowerCase())
        .sort(),
    );
    // Debt tokens are non-transferable, so they appear only in Mint/Burn.
    expect(
      addressSets.filter((set) => set.includes(DEBT_USDC.toLowerCase())),
    ).toHaveLength(2);
  });

  it("attributes logs to the right position by contract address", async () => {
    // WETH supply: 100 principal, balance 110 => 10 interest.
    // USDC borrow: 50 principal, balance 57 => 7 interest.
    const { sends } = stubChain(
      [
        mintLog(A_WETH, USER, "100", "0", 1_500_000),
        mintLog(DEBT_USDC, USER, "50", "0", 1_600_000),
      ],
      {
        [A_WETH.toLowerCase()]: "110",
        [DEBT_USDC.toLowerCase()]: "57",
      },
    );

    const results = await scanPositions(
      market,
      USER,
      [
        { tokenAddress: A_WETH, side: "supply" },
        { tokenAddress: DEBT_USDC, side: "borrow" },
      ],
      true,
    );

    expect(sends).toHaveLength(4);
    const weth = results.find((r) => r.tokenAddress === A_WETH)!;
    const debt = results.find((r) => r.tokenAddress === DEBT_USDC)!;
    expect(weth.data!.accruedRaw).toBe("10");
    expect(weth.data!.eventCount).toBe(1);
    expect(debt.data!.accruedRaw).toBe("7");
    expect(debt.data!.eventCount).toBe(1);
    // Each position sees only its own contract's events.
    expect(weth.data!.ledger).toHaveLength(1);
    expect(debt.data!.ledger).toHaveLength(1);
  });

  it("ignores events belonging to other users and to zero-address transfers", async () => {
    const { sends } = stubChain(
      [
        mintLog(A_WETH, USER, "100", "0", 1_500_000),
        // another user's mint on the same contract
        mintLog(A_WETH, OTHER, "999", "0", 1_500_001, 1),
        // the ERC-20 mirror of a mint: already counted by the Mint event
        transferLog(
          A_WETH,
          ethers.constants.AddressZero,
          USER,
          "100",
          1_500_000,
          2,
        ),
      ],
      { [A_WETH.toLowerCase()]: "110" },
    );

    const [result] = await scanPositions(
      market,
      USER,
      [{ tokenAddress: A_WETH, side: "supply" }],
      true,
    );

    expect(sends).toHaveLength(4);
    expect(result.data!.eventCount).toBe(1);
    expect(result.data!.accruedRaw).toBe("10");
  });

  it("costs nothing per position for reserves the user never touched", async () => {
    const { balanceCalls, decimalsCalls, blockRequests } = stubChain(
      [mintLog(A_WETH, USER, "100", "0", 1_500_000)],
      { [A_WETH.toLowerCase()]: "110" },
    );

    const results = await scanPositions(
      market,
      USER,
      [
        { tokenAddress: A_WETH, side: "supply" },
        { tokenAddress: A_USDC, side: "supply" },
        { tokenAddress: DEBT_USDC, side: "borrow" },
      ],
      true,
    );

    // Only the touched contract is queried for balance/decimals; a position
    // with no events cannot hold a balance.
    expect(balanceCalls).toEqual([A_WETH.toLowerCase()]);
    expect(decimalsCalls).toEqual([A_WETH.toLowerCase()]);
    expect(blockRequests).toEqual([1_500_000]);

    const untouched = results.find((r) => r.tokenAddress === A_USDC)!;
    expect(untouched.data).toEqual({
      accruedValue: "0",
      accruedRaw: "0",
      sinceTimestamp: null,
      eventCount: 0,
      ledger: [],
      realizedValue: "0",
      pendingValue: "0",
    });
  });

  it("dates a block shared by two positions only once", async () => {
    // Supplying collateral and borrowing in the same transaction puts both
    // positions' events in one block.
    const { blockRequests } = stubChain(
      [
        mintLog(A_WETH, USER, "100", "0", 1_500_000),
        mintLog(DEBT_USDC, USER, "50", "0", 1_500_000, 1),
      ],
      {
        [A_WETH.toLowerCase()]: "100",
        [DEBT_USDC.toLowerCase()]: "50",
      },
    );

    await scanPositions(
      market,
      USER,
      [
        { tokenAddress: A_WETH, side: "supply" },
        { tokenAddress: DEBT_USDC, side: "borrow" },
      ],
      true,
    );

    expect(blockRequests).toEqual([1_500_000]);
  });

  it("keeps a whole-market scan's RPC cost flat in the number of reserves", async () => {
    // Aave v3 Ethereum sizing: 67 reserves, both sides, of which this user
    // ever touched two. Scanning reserve by reserve costs a few calls each
    // whether or not there is anything to find; batching must not.
    const reserves = Array.from(
      { length: 67 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
    );
    const positions = reserves.flatMap((address, i) => [
      { tokenAddress: address, side: "supply" as const },
      {
        tokenAddress: `0x${(i + 1000).toString(16).padStart(40, "0")}`,
        side: "borrow" as const,
      },
    ]);

    const touchedSupply = reserves[10];
    const touchedBorrow = positions[41].tokenAddress;
    const { sends, blockRequests, balanceCalls, decimalsCalls } = stubChain(
      [
        mintLog(touchedSupply, USER, "100", "0", 1_500_000),
        mintLog(touchedBorrow, USER, "50", "0", 1_500_000, 1),
      ],
      {
        [touchedSupply.toLowerCase()]: "110",
        [touchedBorrow.toLowerCase()]: "57",
      },
    );

    const results = await scanPositions(market, USER, positions, true);

    expect(results).toHaveLength(134);
    // Four log queries regardless of reserve count, and per-position calls
    // only for the two positions that actually have history.
    expect(sends).toHaveLength(4);
    expect(balanceCalls.sort()).toEqual(
      [touchedSupply.toLowerCase(), touchedBorrow.toLowerCase()].sort(),
    );
    expect(decimalsCalls.sort()).toEqual(
      [touchedSupply.toLowerCase(), touchedBorrow.toLowerCase()].sort(),
    );
    expect(blockRequests).toEqual([1_500_000]);

    // 1 blockNumber + 4 getLogs + 2 balanceOf + 2 decimals + 1 getBlock
    const total =
      1 +
      sends.length +
      balanceCalls.length +
      decimalsCalls.length +
      blockRequests.length;
    expect(total).toBe(10);

    expect(
      results.find((r) => r.tokenAddress === touchedSupply)!.data!.accruedRaw,
    ).toBe("10");
    expect(results.filter((r) => r.data!.eventCount === 0)).toHaveLength(132);
  });

  it("splits the contract set when a batched query exceeds the log cap", async () => {
    // A provider that refuses any query covering more than two contracts,
    // however narrow the block range: the case block-range bisection cannot
    // fix, because it stops at SAFE_RANGE.
    const attempted: number[] = [];
    (
      ethers.providers.StaticJsonRpcProvider as unknown as jest.Mock
    ).mockImplementation(() => ({
      getBlockNumber: async () => LATEST_BLOCK,
      getBlock: async () => ({ timestamp: 1_700_000_000 }),
      send: async (_method: string, params: any[]) => {
        const { address } = params[0];
        const set = Array.isArray(address) ? address : [address];
        attempted.push(set.length);
        if (set.length > 2) {
          throw new Error("query returned more than 10000 results");
        }
        return [];
      },
    }));
    (ethers.Contract as unknown as jest.Mock).mockImplementation(() => ({
      balanceOf: async () => real.BigNumber.from(0),
      decimals: async () => 18,
    }));

    const positions = Array.from({ length: 5 }, (_, i) => ({
      tokenAddress: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      side: "supply" as const,
    }));

    const results = await scanPositions(market, USER, positions, true);

    // Every position still resolves, and the retries converged to sets the
    // provider would serve rather than failing the scan.
    expect(results).toHaveLength(5);
    results.forEach((result) => expect(result.error).toBeUndefined());
    expect(Math.max(...attempted)).toBe(5);
    expect(attempted.filter((size) => size <= 2).length).toBeGreaterThan(0);
  });

  it("skips ledger-only block lookups when no ledger was requested", async () => {
    const { blockRequests } = stubChain(
      [
        mintLog(A_WETH, USER, "100", "0", 1_500_000),
        mintLog(A_WETH, USER, "25", "5", 1_700_000, 1),
      ],
      { [A_WETH.toLowerCase()]: "140" },
    );

    const [result] = await scanPositions(
      market,
      USER,
      [{ tokenAddress: A_WETH, side: "supply" }],
      false,
    );

    // Without a ledger only the first principal event needs a date.
    expect(blockRequests).toEqual([1_500_000]);
    expect(result.data!.ledger).toBeUndefined();
    expect(result.data!.sinceTimestamp).toBe(1_700_000_000 + 1_500_000);
  });
});
