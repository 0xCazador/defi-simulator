import { ethers } from "ethers";
import {
  getReservesHumanizedV37,
  getUserReservesHumanizedV37,
} from "../../utils/uiPoolDataProviderV37";

// The helpers construct an ethers Contract internally; replace the constructor
// so tests can feed in decoded structs.
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
const bn = (value: string | number) => ethers.BigNumber.from(value);

const PROVIDER = {} as ethers.providers.Provider;
const UI_POOL = "0xa7D38785be3422c25677A8aa4a44D3a0853A3a17";
const ADDRESSES_PROVIDER = "0x34793Fb9935F7bB5E5aE920fb963F39063E7A615";
const UNDERLYING = "0xaB6e5a0C3799d020c790D34F7B2C02639e238AF7";
const USER = "0x3145CB0695416effe6eC9585e706f47b6C3c6599";

const ctx = {
  provider: PROVIDER,
  uiPoolDataProviderAddress: UI_POOL,
  lendingPoolAddressProvider: ADDRESSES_PROVIDER,
  chainId: 143,
};

/** A v3.7 reserve tuple as ethers decodes it (no stable-rate or eMode fields). */
const rawReserve = () => ({
  underlyingAsset: UNDERLYING,
  name: "Syrup USDC",
  symbol: "syrupUSDC",
  decimals: bn(6),
  baseLTVasCollateral: bn(0),
  reserveLiquidationThreshold: bn(0),
  reserveLiquidationBonus: bn(0),
  reserveFactor: bn(1000),
  usageAsCollateralEnabled: false,
  borrowingEnabled: false,
  isActive: true,
  isFrozen: false,
  liquidityIndex: bn("1000000000000000000000000000"),
  variableBorrowIndex: bn("1000000000000000000000000000"),
  liquidityRate: bn(0),
  variableBorrowRate: bn(0),
  lastUpdateTimestamp: 1786670000,
  aTokenAddress: "0xbc2A1FA0069e59e2552Ab40889520c7b0D413D9B",
  variableDebtTokenAddress: "0xE84F9B29568747Cb58B2969071e38093A384E26f",
  interestRateStrategyAddress: "0x1f6F08BC1Da8B311bf6D87b829AD2FFAA8fB8211",
  availableLiquidity: bn("171000000000000"),
  totalScaledVariableDebt: bn(0),
  priceInMarketReferenceCurrency: bn(117793912),
  priceOracle: "0xB1f36c815761a3F77CE26c013F646cdCdCd06384",
  variableRateSlope1: bn(0),
  variableRateSlope2: bn(0),
  baseVariableBorrowRate: bn(0),
  optimalUsageRatio: bn(0),
  isPaused: false,
  isSiloedBorrowing: false,
  accruedToTreasury: bn(0),
  isolationModeTotalDebt: bn(0),
  flashLoanEnabled: true,
  debtCeiling: bn(0),
  debtCeilingDecimals: bn(2),
  borrowCap: bn(0),
  supplyCap: bn(240000000),
  borrowableInIsolation: false,
  virtualUnderlyingBalance: bn("171000000000000"),
  deficit: bn(0),
});

const rawBaseCurrency = {
  marketReferenceCurrencyUnit: bn(100000000),
  marketReferenceCurrencyPriceInUsd: bn(100000000),
  networkBaseTokenPriceInUsd: bn(2154503),
  networkBaseTokenPriceDecimals: 8,
};

describe("getReservesHumanizedV37", () => {
  beforeEach(() => jest.clearAllMocks());

  const humanizeOne = async () => {
    mockContract.mockImplementation(() => ({
      getReservesData: async () => [[rawReserve()], rawBaseCurrency],
    }));
    const { reservesData, baseCurrencyData } = await getReservesHumanizedV37(
      ctx
    );
    return { reserve: reservesData[0], baseCurrencyData };
  };

  it("maps the v3.7 reserve fields that are present on chain", async () => {
    const { reserve } = await humanizeOne();

    expect(reserve.symbol).toBe("syrupUSDC");
    expect(reserve.name).toBe("Syrup USDC");
    expect(reserve.decimals).toBe(6);
    expect(reserve.underlyingAsset).toBe(UNDERLYING.toLowerCase());
    expect(reserve.priceInMarketReferenceCurrency).toBe("117793912");
    expect(reserve.availableLiquidity).toBe("171000000000000");
    expect(reserve.supplyCap).toBe("240000000");
    expect(reserve.debtCeilingDecimals).toBe(2);
    expect(reserve.isActive).toBe(true);
    expect(reserve.flashLoanEnabled).toBe(true);
    expect(reserve.aTokenAddress).toBe(
      "0xbc2A1FA0069e59e2552Ab40889520c7b0D413D9B"
    );
  });

  it("builds the id the same way the pinned SDK does", async () => {
    const { reserve } = await humanizeOne();

    expect(reserve.id).toBe(
      `143-${UNDERLYING}-${ADDRESSES_PROVIDER}`.toLowerCase()
    );
  });

  it("fills the fields v3.7 dropped with inert values", async () => {
    const { reserve } = await humanizeOne();

    // Stable-rate borrowing no longer exists in v3.7.
    expect(reserve.stableBorrowRateEnabled).toBe(false);
    expect(reserve.stableBorrowRate).toBe("0");
    expect(reserve.totalPrincipalStableDebt).toBe("0");
    expect(reserve.averageStableRate).toBe("0");
    expect(reserve.stableDebtLastUpdateTimestamp).toBe(0);
    expect(reserve.stableDebtTokenAddress).toBe(ethers.constants.AddressZero);

    // Per-reserve eMode was replaced by the Pool's liquid eMode categories,
    // which are fetched separately in utils/liquidEMode.
    expect(reserve.eModeCategoryId).toBe(0);
    expect(reserve.eModeLtv).toBe(0);
    expect(reserve.eModeLiquidationThreshold).toBe(0);
    expect(reserve.eModeLabel).toBe("");
  });

  it("derives base currency decimals from the reference unit", async () => {
    const { baseCurrencyData } = await humanizeOne();

    expect(baseCurrencyData.marketReferenceCurrencyDecimals).toBe(8);
    expect(baseCurrencyData.marketReferenceCurrencyPriceInUsd).toBe(
      "100000000"
    );
    expect(baseCurrencyData.networkBaseTokenPriceInUsd).toBe("2154503");
    expect(baseCurrencyData.networkBaseTokenPriceDecimals).toBe(8);
  });

  it("passes the addresses provider to the contract call", async () => {
    const getReservesData = jest.fn(async () => [
      [rawReserve()],
      rawBaseCurrency,
    ]);
    mockContract.mockImplementation(() => ({ getReservesData }));

    await getReservesHumanizedV37(ctx);

    expect(getReservesData).toHaveBeenCalledWith(ADDRESSES_PROVIDER);
    expect(mockContract).toHaveBeenCalledWith(
      UI_POOL,
      expect.any(Array),
      PROVIDER
    );
  });
});

describe("getUserReservesHumanizedV37", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps the four-field v3.7 user struct and stubs the stable fields", async () => {
    mockContract.mockImplementation(() => ({
      getUserReservesData: async () => [
        [
          {
            underlyingAsset: UNDERLYING,
            scaledATokenBalance: bn("35696124122479"),
            usageAsCollateralEnabledOnUser: true,
            scaledVariableDebt: bn(0),
          },
        ],
        1,
      ],
    }));

    const { userReserves, userEmodeCategoryId } =
      await getUserReservesHumanizedV37(ctx, USER);

    expect(userEmodeCategoryId).toBe(1);
    expect(userReserves).toHaveLength(1);

    const [reserve] = userReserves;
    expect(reserve.underlyingAsset).toBe(UNDERLYING.toLowerCase());
    expect(reserve.scaledATokenBalance).toBe("35696124122479");
    expect(reserve.usageAsCollateralEnabledOnUser).toBe(true);
    expect(reserve.scaledVariableDebt).toBe("0");
    expect(reserve.id).toBe(
      `143-${USER}-${UNDERLYING}-${ADDRESSES_PROVIDER}`.toLowerCase()
    );

    expect(reserve.stableBorrowRate).toBe("0");
    expect(reserve.principalStableDebt).toBe("0");
    expect(reserve.stableBorrowLastUpdateTimestamp).toBe(0);
  });

  it("passes the addresses provider and user to the contract call", async () => {
    const getUserReservesData = jest.fn(async () => [[], 0]);
    mockContract.mockImplementation(() => ({ getUserReservesData }));

    await getUserReservesHumanizedV37(ctx, USER);

    expect(getUserReservesData).toHaveBeenCalledWith(ADDRESSES_PROVIDER, USER);
  });
});
