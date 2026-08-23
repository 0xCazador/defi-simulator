import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import type {
  PoolBaseCurrencyHumanized,
  ReserveDataHumanized,
  UserReserveDataHumanized,
} from "@aave/contract-helpers";

import { encodeV4PositionRef } from "./spokeEventAccrual";

/**
 * Aave v4 (Hub & Spoke) has no UiPoolDataProvider-style aggregator: reserves
 * and user positions are read from Spoke view functions, prices from the
 * Spoke's own 8-decimal AaveOracle (keyed by reserveId, not underlying), and
 * rates/liquidity from each reserve's Hub. This module batches those reads
 * through Multicall3 (three round-trips per market) and maps the results to
 * the same humanized shapes the rest of the pipeline
 * (formatReserves / formatUserSummary) consumes.
 *
 * Mapping notes:
 * - v4 has a single per-reserve `collateralFactor` instead of the LTV /
 *   liquidation-threshold pair, so both humanized fields carry it and
 *   HF = Σ(collateral × CF) / Σ(debt) matches the on-chain formula.
 * - Balances are returned in already-accrued asset units
 *   (`getUserSuppliedAssets` / `getUserTotalDebt`, premium debt included), so
 *   indexes are pinned to RAY and `lastUpdateTimestamp` to the fetch time —
 *   formatUserSummary then passes the amounts through unchanged while still
 *   deriving APYs from the mapped rates.
 * - The user's per-position dynamic config key can lag the reserve's latest;
 *   when the user holds a position on a reserve, that position's collateral
 *   factor is used so the computed HF matches getUserAccountData.
 * - A Spoke can list the same underlying through several Hubs (e.g. Bluechip
 *   lists USDC from both Prime and Core). formatUserSummary and the app key
 *   assets by underlying, so duplicates are merged: balances are summed and
 *   risk params come from the reserve where the user holds the largest
 *   position (falling back to the highest collateral factor).
 */

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];

const SPOKE_ABI = [
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
];

const ORACLE_ABI = [
  "function getReservesPrices(uint256[] reserveIds) view returns (uint256[])",
];

const HUB_ABI = [
  "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
  "function getAssetLiquidity(uint256 assetId) view returns (uint256)",
  "function getAssetTotalOwed(uint256 assetId) view returns (uint256)",
  "function getAddedAssets(uint256 assetId) view returns (uint256)",
  "function getAsset(uint256 assetId) view returns (tuple(uint120 liquidity, uint120 realizedFees, uint8 decimals, uint120 addedShares, uint120 swept, int200 premiumOffsetRay, uint120 drawnShares, uint120 premiumShares, uint16 liquidityFee, uint120 drawnIndex, uint96 drawnRate, uint40 lastUpdateTimestamp, address underlying, address irStrategy, address reinvestmentController, address feeReceiver, uint200 deficitRay))",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

const spokeInterface = new ethers.utils.Interface(SPOKE_ABI);
const oracleInterface = new ethers.utils.Interface(ORACLE_ABI);
const hubInterface = new ethers.utils.Interface(HUB_ABI);
const erc20Interface = new ethers.utils.Interface(ERC20_ABI);

const { AddressZero } = ethers.constants;
const RAY = "1000000000000000000000000000"; // 1e27
const USD_UNIT = "100000000"; // oracle prices and Value units are 8-decimal USD

type Call = { target: string; allowFailure: boolean; callData: string };

/** One Multicall3 round-trip. Each entry decodes with its own interface. */
const multicall = async (
  provider: ethers.providers.Provider,
  calls: {
    target: string;
    iface: ethers.utils.Interface;
    fn: string;
    args: unknown[];
  }[],
): Promise<ethers.utils.Result[]> => {
  const multicall3 = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    provider,
  );
  const payload: Call[] = calls.map((call) => ({
    target: call.target,
    allowFailure: false,
    callData: call.iface.encodeFunctionData(call.fn, call.args),
  }));
  const results: { success: boolean; returnData: string }[] =
    await multicall3.callStatic.aggregate3(payload);
  return results.map((result, i) =>
    calls[i].iface.decodeFunctionResult(calls[i].fn, result.returnData),
  );
};

export type V4Context = {
  provider: ethers.providers.Provider;
  spokeAddress: string;
  oracleAddress: string;
  chainId: number;
};

/** On-chain account summary from Spoke.getUserAccountData, for validation
 * against the locally computed health factor. */
export type V4UserAccountData = {
  /** basis points */
  riskPremium: number;
  /** health factor as a decimal number (WAD-scaled on-chain) */
  healthFactor: number;
  /** USD (8-decimal Value units on-chain) */
  totalCollateralUSD: number;
  /** USD (RAY-scaled 8-decimal Value units on-chain) */
  totalDebtUSD: number;
};

export type V4MarketData = {
  reservesData: ReserveDataHumanized[];
  baseCurrencyData: PoolBaseCurrencyHumanized;
  userReserves: UserReserveDataHumanized[];
  /** v4 has no eModes (correlated-asset Spokes replace them) */
  userEmodeCategoryId: number;
  accountData: V4UserAccountData;
  /** underlying (lowercase) → Spoke reserveId, for accrual scans etc. */
  reserveIds: Map<string, number>;
};

/** Per-reserve intermediate record before duplicate-underlying merging. */
type ReserveRecord = {
  reserveId: number;
  underlying: string;
  hub: string;
  assetId: number;
  decimals: number;
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
  collateralFactor: number;
  maxLiquidationBonus: number;
  liquidationFee: number;
  reserveTotalDebt: ethers.BigNumber;
  userSupplied: ethers.BigNumber;
  userDebt: ethers.BigNumber;
  enabledAsCollateral: boolean;
  price: ethers.BigNumber;
  symbol: string;
  name: string;
  drawnRate: ethers.BigNumber;
  liquidity: ethers.BigNumber;
  totalOwed: ethers.BigNumber;
  addedAssets: ethers.BigNumber;
  liquidityFee: number;
};

/**
 * Supply rate from the drawn (borrow) rate: borrow interest is distributed to
 * suppliers pro-rata to utilization, minus the Hub's liquidity fee. Rates are
 * RAY-scaled per-second APRs, matching what formatReserves expects.
 */
const deriveLiquidityRate = (record: ReserveRecord): string => {
  if (record.addedAssets.isZero()) return "0";
  return new BigNumber(record.drawnRate.toString())
    .multipliedBy(record.totalOwed.toString())
    .dividedBy(record.addedAssets.toString())
    .multipliedBy(10000 - record.liquidityFee)
    .dividedBy(10000)
    .toFixed(0);
};

/**
 * Fetch everything a v4 market needs in three Multicall3 round-trips:
 *  1. reserve count + user account data
 *  2. per-reserve structs, configs and user amounts
 *  3. dynamic configs, oracle prices, ERC-20 metadata and Hub asset data
 */
export const getV4MarketData = async (
  { provider, spokeAddress, oracleAddress, chainId }: V4Context,
  user: string,
): Promise<V4MarketData> => {
  // Round-trip 1: how many reserves, and the user's on-chain account summary.
  const [[reserveCountRaw], [accountRaw]] = await multicall(provider, [
    {
      target: spokeAddress,
      iface: spokeInterface,
      fn: "getReserveCount",
      args: [],
    },
    {
      target: spokeAddress,
      iface: spokeInterface,
      fn: "getUserAccountData",
      args: [user],
    },
  ]);
  const reserveCount = Number(reserveCountRaw);
  const reserveIdList = Array.from({ length: reserveCount }, (_, i) => i);

  // Round-trip 2: per-reserve structs, static config and user amounts.
  const perReserveFns = [
    "getReserve",
    "getReserveConfig",
    "getReserveTotalDebt",
    "getUserSuppliedAssets",
    "getUserTotalDebt",
    "getUserReserveStatus",
    "getUserPosition",
  ] as const;
  const rt2 = await multicall(
    provider,
    reserveIdList.flatMap((id) =>
      perReserveFns.map((fn) => ({
        target: spokeAddress,
        iface: spokeInterface,
        fn,
        args: fn.startsWith("getUser") ? [id, user] : [id],
      })),
    ),
  );
  const rt2For = (reserveId: number, fn: (typeof perReserveFns)[number]) =>
    rt2[reserveId * perReserveFns.length + perReserveFns.indexOf(fn)];

  const reserves = reserveIdList.map((id) => rt2For(id, "getReserve")[0]);
  const configs = reserveIdList.map((id) => rt2For(id, "getReserveConfig")[0]);
  const userPositions = reserveIdList.map(
    (id) => rt2For(id, "getUserPosition")[0],
  );
  const hasPosition = reserveIdList.map(
    (id) =>
      !rt2For(id, "getUserSuppliedAssets")[0].isZero() ||
      !rt2For(id, "getUserTotalDebt")[0].isZero(),
  );

  // Round-trip 3: dynamic configs (the user's position may be pinned to an
  // older config key than the reserve's latest — fetch the user's key for
  // held positions so risk params match getUserAccountData), oracle prices,
  // ERC-20 metadata, and Hub asset data for rates/liquidity.
  const dynamicConfigCalls = reserveIdList.map((id) => ({
    target: spokeAddress,
    iface: spokeInterface,
    fn: "getDynamicReserveConfig",
    args: [
      id,
      hasPosition[id]
        ? userPositions[id].dynamicConfigKey
        : reserves[id].dynamicConfigKey,
    ],
  }));

  const uniqueUnderlyings = [
    ...new Set(reserves.map((r) => r.underlying.toLowerCase())),
  ];
  const erc20Calls = uniqueUnderlyings.flatMap((underlying) => [
    { target: underlying, iface: erc20Interface, fn: "symbol", args: [] },
    { target: underlying, iface: erc20Interface, fn: "name", args: [] },
  ]);

  const hubAssetKeys = [
    ...new Set(
      reserves.map((r) => `${r.hub.toLowerCase()}-${Number(r.assetId)}`),
    ),
  ];
  const hubFns = [
    "getAssetDrawnRate",
    "getAssetLiquidity",
    "getAssetTotalOwed",
    "getAddedAssets",
    "getAsset",
  ] as const;
  const hubCalls = hubAssetKeys.flatMap((key) => {
    const [hub, assetId] = key.split("-");
    return hubFns.map((fn) => ({
      target: hub,
      iface: hubInterface,
      fn,
      args: [assetId],
    }));
  });

  const rt3 = await multicall(provider, [
    ...dynamicConfigCalls,
    {
      target: oracleAddress,
      iface: oracleInterface,
      fn: "getReservesPrices",
      args: [reserveIdList],
    },
    ...erc20Calls,
    ...hubCalls,
  ]);

  const dynamicConfigs = reserveIdList.map((id) => rt3[id][0]);
  const prices: ethers.BigNumber[] = rt3[reserveCount][0];
  const erc20Base = reserveCount + 1;
  const metaByUnderlying = new Map(
    uniqueUnderlyings.map((underlying, i) => [
      underlying,
      {
        symbol: String(rt3[erc20Base + i * 2][0]),
        name: String(rt3[erc20Base + i * 2 + 1][0]),
      },
    ]),
  );
  const hubBase = erc20Base + erc20Calls.length;
  const hubDataByKey = new Map(
    hubAssetKeys.map((key, i) => [
      key,
      {
        drawnRate: rt3[hubBase + i * hubFns.length][0] as ethers.BigNumber,
        liquidity: rt3[hubBase + i * hubFns.length + 1][0] as ethers.BigNumber,
        totalOwed: rt3[hubBase + i * hubFns.length + 2][0] as ethers.BigNumber,
        addedAssets: rt3[
          hubBase + i * hubFns.length + 3
        ][0] as ethers.BigNumber,
        liquidityFee: Number(
          rt3[hubBase + i * hubFns.length + 4][0].liquidityFee,
        ),
      },
    ]),
  );

  const records: ReserveRecord[] = reserveIdList.map((id) => {
    const underlying = reserves[id].underlying.toLowerCase();
    const hubKey = `${reserves[id].hub.toLowerCase()}-${Number(reserves[id].assetId)}`;
    const hubData = hubDataByKey.get(hubKey)!;
    const meta = metaByUnderlying.get(underlying)!;
    const [enabledAsCollateral] = rt2For(id, "getUserReserveStatus");
    return {
      reserveId: id,
      underlying,
      hub: reserves[id].hub.toLowerCase(),
      assetId: Number(reserves[id].assetId),
      decimals: Number(reserves[id].decimals),
      paused: configs[id].paused,
      frozen: configs[id].frozen,
      borrowable: configs[id].borrowable,
      collateralFactor: Number(dynamicConfigs[id].collateralFactor),
      maxLiquidationBonus: Number(dynamicConfigs[id].maxLiquidationBonus),
      liquidationFee: Number(dynamicConfigs[id].liquidationFee),
      reserveTotalDebt: rt2For(id, "getReserveTotalDebt")[0],
      userSupplied: rt2For(id, "getUserSuppliedAssets")[0],
      userDebt: rt2For(id, "getUserTotalDebt")[0],
      enabledAsCollateral,
      price: prices[id],
      symbol: meta.symbol,
      name: meta.name,
      drawnRate: hubData.drawnRate,
      liquidity: hubData.liquidity,
      totalOwed: hubData.totalOwed,
      addedAssets: hubData.addedAssets,
      liquidityFee: hubData.liquidityFee,
    };
  });

  // Merge reserves that share an underlying (same asset listed via several
  // Hubs): sum the user's amounts, and represent the group with the reserve
  // where the user holds the largest position — falling back to the highest
  // collateral factor so simulated supplies use the most favorable venue.
  const groups = new Map<string, ReserveRecord[]>();
  records.forEach((record) => {
    const group = groups.get(record.underlying) ?? [];
    group.push(record);
    groups.set(record.underlying, group);
  });

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const reservesData: ReserveDataHumanized[] = [];
  const userReserves: UserReserveDataHumanized[] = [];
  const reserveIds = new Map<string, number>();

  [...groups.values()].forEach((group) => {
    const primary = [...group].sort((a, b) => {
      const positionA = a.userSupplied.add(a.userDebt);
      const positionB = b.userSupplied.add(b.userDebt);
      if (!positionA.eq(positionB)) return positionA.lt(positionB) ? 1 : -1;
      return b.collateralFactor - a.collateralFactor;
    })[0];

    const userSupplied = group.reduce(
      (sum, r) => sum.add(r.userSupplied),
      ethers.constants.Zero,
    );
    const userDebt = group.reduce(
      (sum, r) => sum.add(r.userDebt),
      ethers.constants.Zero,
    );

    const collateralFactor = String(primary.collateralFactor);
    reserveIds.set(primary.underlying, primary.reserveId);

    reservesData.push({
      id: `${chainId}-${primary.underlying}-${spokeAddress}`.toLowerCase(),
      originalId: primary.reserveId,
      underlyingAsset: primary.underlying,
      name: primary.name,
      symbol: primary.symbol,
      decimals: primary.decimals,
      baseLTVasCollateral: collateralFactor,
      reserveLiquidationThreshold: collateralFactor,
      reserveLiquidationBonus: String(primary.maxLiquidationBonus),
      reserveFactor: String(primary.liquidityFee),
      usageAsCollateralEnabled: primary.collateralFactor > 0,
      borrowingEnabled: group.some((r) => r.borrowable),
      isActive: true,
      isFrozen: group.every((r) => r.frozen),
      liquidityIndex: RAY,
      variableBorrowIndex: RAY,
      liquidityRate: deriveLiquidityRate(primary),
      variableBorrowRate: primary.drawnRate.toString(),
      lastUpdateTimestamp: currentTimestamp,
      // v4 has no aTokens/debt tokens; these synthetic refs carry the Spoke
      // reserveId through the tokenAddress-keyed accrual hooks and UI.
      aTokenAddress: encodeV4PositionRef(primary.reserveId, "supply"),
      variableDebtTokenAddress: encodeV4PositionRef(
        primary.reserveId,
        "borrow",
      ),
      interestRateStrategyAddress: AddressZero,
      availableLiquidity: primary.liquidity.toString(),
      totalScaledVariableDebt: primary.reserveTotalDebt.toString(),
      priceInMarketReferenceCurrency: primary.price.toString(),
      priceOracle: oracleAddress,
      variableRateSlope1: "0",
      variableRateSlope2: "0",
      baseVariableBorrowRate: "0",
      optimalUsageRatio: "0",
      isPaused: group.every((r) => r.paused),
      isSiloedBorrowing: false,
      accruedToTreasury: "0",
      isolationModeTotalDebt: "0",
      flashLoanEnabled: false,
      debtCeiling: "0",
      debtCeilingDecimals: 0,
      // v4 caps live on the Hub per (asset, spoke); 0 means "no cap" in the
      // humanized convention, which is how the app treats missing caps.
      borrowCap: "0",
      supplyCap: "0",
      borrowableInIsolation: false,
      virtualUnderlyingBalance: primary.liquidity.toString(),
      deficit: "0",
    });

    userReserves.push({
      id: `${chainId}-${user}-${primary.underlying}-${spokeAddress}`.toLowerCase(),
      underlyingAsset: primary.underlying,
      // Indexes are pinned to RAY above, so these pass through
      // formatUserSummary as the already-accrued asset amounts they are.
      scaledATokenBalance: userSupplied.toString(),
      usageAsCollateralEnabledOnUser: group.some(
        (r) => r.enabledAsCollateral && !r.userSupplied.isZero(),
      ),
      scaledVariableDebt: userDebt.toString(),
    });
  });

  // Value units are 8-decimal USD; totalDebtValueRay is additionally
  // RAY-scaled (so shift by 8 + 27).
  const accountData: V4UserAccountData = {
    riskPremium: Number(accountRaw.riskPremium),
    healthFactor: new BigNumber(accountRaw.healthFactor.toString())
      .shiftedBy(-18)
      .toNumber(),
    totalCollateralUSD: new BigNumber(
      accountRaw.totalCollateralValue.toString(),
    )
      .shiftedBy(-8)
      .toNumber(),
    totalDebtUSD: new BigNumber(accountRaw.totalDebtValueRay.toString())
      .shiftedBy(-35)
      .toNumber(),
  };

  return {
    reservesData,
    baseCurrencyData: {
      marketReferenceCurrencyDecimals: 8,
      marketReferenceCurrencyPriceInUsd: USD_UNIT,
      networkBaseTokenPriceInUsd: USD_UNIT,
      networkBaseTokenPriceDecimals: 8,
    },
    userReserves,
    userEmodeCategoryId: 0,
    accountData,
    reserveIds,
  };
};
