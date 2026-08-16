import { ethers } from "ethers";
import { formatReserves, formatUserSummary } from "@aave/math-utils";
import dayjs from "dayjs";

import { getV4MarketData } from "../../utils/spokeDataProviderV4";
import { encodeV4PositionRef } from "../../utils/spokeEventAccrual";

// The adapter only touches the chain through Multicall3's aggregate3, so a
// mocked Contract constructor is enough to stand in a whole fake chain: each
// batched call is decoded, answered from the fixture state below, and
// re-encoded — exercising the adapter's real ABI coding both ways.
jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn(),
    },
  };
});

const mockContract = ethers.Contract as unknown as jest.Mock;
const bn = ethers.BigNumber.from;

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SPOKE = "0x94e7A5dCbE816e498b89aB752661904E2F56c485";
const ORACLE = "0x99B2B6CEa9C3D2fd8F4d90f86741C44B212a6127";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase();
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase();
const CORE_HUB = "0xCca8521111111111111111111111111111111111".toLowerCase();
const PRIME_HUB = "0x9438271111111111111111111111111111111111".toLowerCase();
const USER = "0x3145CB0695416effe6eC9585e706f47b6C3c6599";

const PROVIDER = {} as ethers.providers.Provider;
const RAY = "1000000000000000000000000000";

// Interface over every contract the adapter batches through Multicall3
// (function names are unique across them). Mirrors the adapter's ABIs.
const chain = new ethers.utils.Interface([
  "function getReserveCount() view returns (uint256)",
  "function getUserAccountData(address user) view returns (tuple(uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount))",
  "function getReserve(uint256 reserveId) view returns (tuple(address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))",
  "function getReserveConfig(uint256 reserveId) view returns (tuple(uint24 collateralRisk, bool paused, bool frozen, bool borrowable, bool receiveSharesEnabled))",
  "function getDynamicReserveConfig(uint256 reserveId, uint32 dynamicConfigKey) view returns (tuple(uint16 collateralFactor, uint32 maxLiquidationBonus, uint16 liquidationFee))",
  "function getReserveTotalDebt(uint256 reserveId) view returns (uint256)",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 reserveId, address user) view returns (uint256)",
  "function getUserReserveStatus(uint256 reserveId, address user) view returns (bool, bool)",
  "function getUserPosition(uint256 reserveId, address user) view returns (tuple(uint120 drawnShares, uint120 premiumShares, int200 premiumOffsetRay, uint120 suppliedShares, uint32 dynamicConfigKey))",
  "function getReservesPrices(uint256[] reserveIds) view returns (uint256[])",
  "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
  "function getAssetLiquidity(uint256 assetId) view returns (uint256)",
  "function getAssetTotalOwed(uint256 assetId) view returns (uint256)",
  "function getAddedAssets(uint256 assetId) view returns (uint256)",
  "function getAsset(uint256 assetId) view returns (tuple(uint120 liquidity, uint120 realizedFees, uint8 decimals, uint120 addedShares, uint120 swept, int200 premiumOffsetRay, uint120 drawnShares, uint120 premiumShares, uint16 liquidityFee, uint120 drawnIndex, uint96 drawnRate, uint40 lastUpdateTimestamp, address underlying, address irStrategy, address reinvestmentController, address feeReceiver, uint200 deficitRay))",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

/**
 * Three reserves on one Spoke:
 *  - 0: WETH via the Core Hub. The user supplies 10 (collateral-enabled) and
 *       their position is pinned to dynamic config key 1 (CF 80%) while the
 *       reserve's latest key is 2 (CF 82%) — the adapter must use the user's.
 *  - 1: USDC via the Core Hub. The user owes 8,000.
 *  - 2: USDC again via the Prime Hub (duplicate underlying). The user
 *       supplies 500, not enabled as collateral, and the reserve is frozen.
 *
 * On-chain HF: (10 × $2,000 × 0.80) / (8,000 × $1) = 2.0
 */
const reserveFixtures = [
  {
    underlying: WETH,
    hub: CORE_HUB,
    assetId: 1,
    decimals: 18,
    reserveConfigKey: 2,
    userConfigKey: 1,
    frozen: false,
    borrowable: true,
    collateralFactorByKey: { 1: 8000, 2: 8200 } as Record<number, number>,
    totalDebt: bn("5000000000000000000000"), // 5,000 WETH
    userSupplied: bn("10000000000000000000"), // 10 WETH
    userDebt: bn(0),
    enabledAsCollateral: true,
    price: bn("200000000000"), // $2,000
    symbol: "WETH",
    name: "Wrapped Ether",
  },
  {
    underlying: USDC,
    hub: CORE_HUB,
    assetId: 2,
    decimals: 6,
    reserveConfigKey: 3,
    userConfigKey: 3,
    frozen: false,
    borrowable: true,
    collateralFactorByKey: { 3: 7500 } as Record<number, number>,
    totalDebt: bn("8000000000000"), // 8M USDC
    userSupplied: bn(0),
    userDebt: bn("8000000000"), // 8,000 USDC
    enabledAsCollateral: false,
    price: bn("100000000"), // $1
    symbol: "USDC",
    name: "USD Coin",
  },
  {
    underlying: USDC,
    hub: PRIME_HUB,
    assetId: 9,
    decimals: 6,
    reserveConfigKey: 4,
    userConfigKey: 4,
    frozen: true,
    borrowable: false,
    collateralFactorByKey: { 4: 7000 } as Record<number, number>,
    totalDebt: bn(0),
    userSupplied: bn("500000000"), // 500 USDC
    userDebt: bn(0),
    enabledAsCollateral: false,
    price: bn("100000000"),
    symbol: "USDC",
    name: "USD Coin",
  },
];

const hubFixtures: Record<
  string,
  {
    drawnRate: ethers.BigNumber;
    liquidity: ethers.BigNumber;
    totalOwed: ethers.BigNumber;
    addedAssets: ethers.BigNumber;
    liquidityFee: number;
  }
> = {
  [`${CORE_HUB}-1`]: {
    drawnRate: bn("30000000000000000000000000"), // 3% APR in RAY
    liquidity: bn("4000000000000000000000"),
    totalOwed: bn("5000000000000000000000"),
    addedAssets: bn("10000000000000000000000"),
    liquidityFee: 1000, // 10%
  },
  [`${CORE_HUB}-2`]: {
    drawnRate: bn("50000000000000000000000000"),
    liquidity: bn("2000000000000"),
    totalOwed: bn("8000000000000"),
    addedAssets: bn("10000000000000"),
    liquidityFee: 1000,
  },
  [`${PRIME_HUB}-9`]: {
    drawnRate: bn(0),
    liquidity: bn("100000000"),
    totalOwed: bn(0),
    addedAssets: bn(0),
    liquidityFee: 0,
  },
};

const accountFixture = {
  riskPremium: bn(0),
  avgCollateralFactor: bn(8000),
  healthFactor: bn("2000000000000000000"), // 2.0 in WAD
  totalCollateralValue: bn("2000000000000"), // $20,000 in 8-decimal Value units
  totalDebtValueRay: bn("800000000000").mul(bn(10).pow(27)), // $8,000, RAY-scaled
  activeCollateralCount: bn(1),
  borrowCount: bn(1),
};

const metaByAddress: Record<string, { symbol: string; name: string }> = {
  [WETH]: { symbol: "WETH", name: "Wrapped Ether" },
  [USDC]: { symbol: "USDC", name: "USD Coin" },
};

/** Answer one decoded call against the fixture state. */
const answer = (target: string, fn: string, args: ethers.utils.Result) => {
  const reserve = () => reserveFixtures[Number(args[0])];
  switch (fn) {
    case "getReserveCount":
      return [reserveFixtures.length];
    case "getUserAccountData":
      expect(args[0]).toBe(USER);
      return [
        [
          accountFixture.riskPremium,
          accountFixture.avgCollateralFactor,
          accountFixture.healthFactor,
          accountFixture.totalCollateralValue,
          accountFixture.totalDebtValueRay,
          accountFixture.activeCollateralCount,
          accountFixture.borrowCount,
        ],
      ];
    case "getReserve": {
      const r = reserve();
      return [[r.underlying, r.hub, r.assetId, r.decimals, 0, 0, r.reserveConfigKey]];
    }
    case "getReserveConfig": {
      const r = reserve();
      return [[0, false, r.frozen, r.borrowable, false]];
    }
    case "getDynamicReserveConfig": {
      const r = reserve();
      const cf = r.collateralFactorByKey[Number(args[1])];
      // the adapter must only ever ask for keys the fixture defines
      expect(cf).toBeDefined();
      return [[cf, 10500, 1000]];
    }
    case "getReserveTotalDebt":
      return [reserve().totalDebt];
    case "getUserSuppliedAssets":
      return [reserve().userSupplied];
    case "getUserTotalDebt":
      return [reserve().userDebt];
    case "getUserReserveStatus":
      return [reserve().enabledAsCollateral, !reserve().userDebt.isZero()];
    case "getUserPosition":
      return [[0, 0, 0, 0, reserve().userConfigKey]];
    case "getReservesPrices":
      return [(args[0] as ethers.BigNumber[]).map((id) => reserveFixtures[Number(id)].price)];
    case "symbol":
      return [metaByAddress[target].symbol];
    case "name":
      return [metaByAddress[target].name];
    case "getAssetDrawnRate":
      return [hubFixtures[`${target}-${Number(args[0])}`].drawnRate];
    case "getAssetLiquidity":
      return [hubFixtures[`${target}-${Number(args[0])}`].liquidity];
    case "getAssetTotalOwed":
      return [hubFixtures[`${target}-${Number(args[0])}`].totalOwed];
    case "getAddedAssets":
      return [hubFixtures[`${target}-${Number(args[0])}`].addedAssets];
    case "getAsset": {
      const hub = hubFixtures[`${target}-${Number(args[0])}`];
      const zero = ethers.constants.AddressZero;
      return [
        [
          hub.liquidity, 0, 6, 0, 0, 0, 0, 0,
          hub.liquidityFee,
          0, hub.drawnRate, 0, zero, zero, zero, zero, 0,
        ],
      ];
    }
    default:
      throw new Error(`Unexpected call: ${fn} on ${target}`);
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockContract.mockImplementation(() => ({
    callStatic: {
      aggregate3: async (
        calls: { target: string; allowFailure: boolean; callData: string }[],
      ) =>
        calls.map(({ target, callData }) => {
          const fragment = chain.getFunction(callData.slice(0, 10));
          const args = chain.decodeFunctionData(fragment, callData);
          return {
            success: true,
            returnData: chain.encodeFunctionResult(
              fragment,
              answer(target.toLowerCase(), fragment.name, args),
            ),
          };
        }),
    },
  }));
});

const fetchMarket = () =>
  getV4MarketData(
    { provider: PROVIDER, spokeAddress: SPOKE, oracleAddress: ORACLE, chainId: 1 },
    USER,
  );

describe("getV4MarketData", () => {
  it("routes every read through Multicall3 in three round-trips", async () => {
    await fetchMarket();

    expect(mockContract).toHaveBeenCalledTimes(3);
    mockContract.mock.calls.forEach(([address, , provider]) => {
      expect(address).toBe(MULTICALL3);
      expect(provider).toBe(PROVIDER);
    });
  });

  it("maps a v4 reserve to the humanized shape with CF-only risk params", async () => {
    const { reservesData, baseCurrencyData } = await fetchMarket();
    const weth = reservesData.find((r) => r.symbol === "WETH")!;

    expect(weth.underlyingAsset).toBe(WETH);
    expect(weth.name).toBe("Wrapped Ether");
    expect(weth.decimals).toBe(18);
    // v4's single collateralFactor feeds both LTV and liquidation threshold —
    // from the user's dynamic config key (CF 8000), not the reserve's latest
    // (CF 8200), so the computed HF matches getUserAccountData.
    expect(weth.baseLTVasCollateral).toBe("8000");
    expect(weth.reserveLiquidationThreshold).toBe("8000");
    expect(weth.reserveLiquidationBonus).toBe("10500");
    expect(weth.usageAsCollateralEnabled).toBe(true);
    expect(weth.borrowingEnabled).toBe(true);
    expect(weth.priceInMarketReferenceCurrency).toBe("200000000000");
    expect(weth.availableLiquidity).toBe("4000000000000000000000");
    // balances arrive already accrued, so indexes are pinned to RAY
    expect(weth.liquidityIndex).toBe(RAY);
    expect(weth.variableBorrowIndex).toBe(RAY);
    expect(weth.variableBorrowRate).toBe("30000000000000000000000000");
    // supply rate = drawn rate × utilization (5000/10000) × (1 − 10% fee)
    expect(weth.liquidityRate).toBe("13500000000000000000000000");
    // synthetic position refs carry the reserveId through the accrual system
    expect(weth.aTokenAddress).toBe(encodeV4PositionRef(0, "supply"));
    expect(weth.variableDebtTokenAddress).toBe(encodeV4PositionRef(0, "borrow"));

    // oracle prices are 8-decimal USD
    expect(baseCurrencyData.marketReferenceCurrencyDecimals).toBe(8);
    expect(baseCurrencyData.marketReferenceCurrencyPriceInUsd).toBe(
      "100000000",
    );
  });

  it("merges duplicate underlyings across Hubs", async () => {
    const { reservesData, userReserves, reserveIds } = await fetchMarket();

    // three reserves, but WETH + one merged USDC entry
    expect(reservesData).toHaveLength(2);
    const usdc = reservesData.find((r) => r.symbol === "USDC")!;

    // risk params come from the reserve with the user's largest position
    // (the 8,000 debt on reserve 1, CF 7500 — not reserve 2's CF 7000)
    expect(usdc.originalId).toBe(1);
    expect(usdc.baseLTVasCollateral).toBe("7500");
    expect(reserveIds.get(USDC)).toBe(1);
    // merged flags: borrowable/unfrozen if any grouped reserve is
    expect(usdc.borrowingEnabled).toBe(true);
    expect(usdc.isFrozen).toBe(false);

    // user amounts are summed across the group
    const usdcUser = userReserves.find((u) => u.underlyingAsset === USDC)!;
    expect(usdcUser.scaledATokenBalance).toBe("500000000");
    expect(usdcUser.scaledVariableDebt).toBe("8000000000");
    // the only supplied USDC (reserve 2) is not enabled as collateral
    expect(usdcUser.usageAsCollateralEnabledOnUser).toBe(false);

    const wethUser = userReserves.find((u) => u.underlyingAsset === WETH)!;
    expect(wethUser.scaledATokenBalance).toBe("10000000000000000000");
    expect(wethUser.scaledVariableDebt).toBe("0");
    expect(wethUser.usageAsCollateralEnabledOnUser).toBe(true);
  });

  it("decodes the on-chain account data for validation", async () => {
    const { accountData, userEmodeCategoryId } = await fetchMarket();

    expect(userEmodeCategoryId).toBe(0);
    expect(accountData.riskPremium).toBe(0);
    expect(accountData.healthFactor).toBe(2);
    expect(accountData.totalCollateralUSD).toBe(20000);
    expect(accountData.totalDebtUSD).toBe(8000);
  });

  it("reproduces the on-chain health factor through formatUserSummary", async () => {
    const { reservesData, baseCurrencyData, userReserves, accountData } =
      await fetchMarket();

    const currentTimestamp = dayjs().unix();
    const formattedReserves = formatReserves({
      reserves: reservesData,
      currentTimestamp,
      marketReferenceCurrencyDecimals:
        baseCurrencyData.marketReferenceCurrencyDecimals,
      marketReferencePriceInUsd:
        baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    });
    const summary = formatUserSummary({
      currentTimestamp,
      marketReferencePriceInUsd:
        baseCurrencyData.marketReferenceCurrencyPriceInUsd,
      marketReferenceCurrencyDecimals:
        baseCurrencyData.marketReferenceCurrencyDecimals,
      userReserves,
      formattedReserves,
      userEmodeCategoryId: 0,
    });

    // (10 WETH × $2,000 × CF 0.80) / (8,000 USDC × $1) = 2.0 — this validates
    // the CF/premium-debt mapping end to end against getUserAccountData.
    expect(Number(summary.healthFactor)).toBeCloseTo(
      accountData.healthFactor,
      6,
    );
    expect(Number(summary.totalBorrowsUSD)).toBeCloseTo(
      accountData.totalDebtUSD,
      2,
    );
  });
});
