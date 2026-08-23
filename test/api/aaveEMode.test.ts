/**
 * @jest-environment node
 *
 * Guards the eMode fetch gating in getAaveData.
 *
 * Enumerating every eMode category on a pool costs ~40 RPC calls, and the app
 * fetches every market on load, so doing it unconditionally dominated the RPC
 * bill. Only the user's *active* category can change their risk params, so the
 * fetch must be skipped entirely when the user is in no eMode and scoped to a
 * single category when they are.
 */
import { AaveMarketDataType, markets } from "../../hooks/useAaveData";
import { getAaveData } from "../../pages/api/aave";

const getReservesHumanized = jest.fn();
const getUserReservesHumanized = jest.fn();

jest.mock("@aave/contract-helpers", () => ({
  ...jest.requireActual("@aave/contract-helpers"),
  UiPoolDataProvider: jest.fn().mockImplementation(() => ({
    getReservesHumanized,
    getUserReservesHumanized,
  })),
}));

jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      providers: {
        ...actual.ethers.providers,
        StaticJsonRpcProvider: jest.fn().mockImplementation(() => ({})),
      },
    },
  };
});

const fetchEModeCategory = jest.fn();
const fetchEModeCategories = jest.fn();
const fetchReserveIds = jest.fn();

jest.mock("../../utils/liquidEMode", () => {
  const actual = jest.requireActual("../../utils/liquidEMode");
  return {
    ...actual,
    fetchPoolAddress: jest.fn(async () => "0xpool"),
    fetchEModeCategory: (...args: unknown[]) => fetchEModeCategory(...args),
    fetchEModeCategories: (...args: unknown[]) => fetchEModeCategories(...args),
    fetchReserveIds: (...args: unknown[]) => fetchReserveIds(...args),
  };
});

jest.mock("../../pages/api/resolver", () => ({
  getResolvedAddress: jest.fn(async (address: string) => address),
}));

const user = "0x0000000000000000000000000000000000000001";

/** A v3 market on the standard (non-v37) UiPoolDataProvider path. */
const market = markets.find(
  (m: AaveMarketDataType) => !m.v4 && !m.v37,
) as AaveMarketDataType;

const baseCurrencyData = {
  marketReferenceCurrencyDecimals: 8,
  marketReferenceCurrencyPriceInUsd: "100000000",
  networkBaseTokenPriceInUsd: "100000000",
  networkBaseTokenPriceDecimals: 8,
};

beforeEach(() => {
  jest.clearAllMocks();
  getReservesHumanized.mockResolvedValue({
    reservesData: [],
    baseCurrencyData,
  });
  fetchReserveIds.mockResolvedValue(new Map());
  fetchEModeCategory.mockResolvedValue(null);
});

describe("getAaveData eMode fetching", () => {
  it("makes no eMode calls when the user is in no eMode", async () => {
    getUserReservesHumanized.mockResolvedValue({
      userReserves: [],
      userEmodeCategoryId: 0,
    });

    await getAaveData(user, market, user);

    expect(fetchEModeCategory).not.toHaveBeenCalled();
    expect(fetchEModeCategories).not.toHaveBeenCalled();
  });

  it("fetches only the user's active category when they are in an eMode", async () => {
    getUserReservesHumanized.mockResolvedValue({
      userReserves: [],
      userEmodeCategoryId: 5,
    });
    fetchEModeCategory.mockResolvedValue({
      id: 5,
      label: "ETH correlated",
      ltv: 9300,
      liquidationThreshold: 9500,
      collateralBitmap: "3",
      borrowableBitmap: "1",
    });

    const data = await getAaveData(user, market, user);

    expect(fetchEModeCategory).toHaveBeenCalledTimes(1);
    expect(fetchEModeCategory).toHaveBeenCalledWith(
      expect.anything(),
      "0xpool",
      5,
    );
    // The full-pool scan must never be reached from this path.
    expect(fetchEModeCategories).not.toHaveBeenCalled();
    expect(data.fetchedData?.eModes).toEqual([
      expect.objectContaining({ id: 5 }),
    ]);
    expect(data.fetchedData?.userEmodeLabel).toBe("ETH correlated");
  });

  it("degrades to no eMode data when the category fetch fails", async () => {
    getUserReservesHumanized.mockResolvedValue({
      userReserves: [],
      userEmodeCategoryId: 5,
    });
    fetchEModeCategory.mockRejectedValue(new Error("execution reverted"));
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    const data = await getAaveData(user, market, user);

    expect(data.fetchedData?.eModes).toEqual([]);
    expect(data.fetchedData?.userEmodeCategoryId).toBe(5);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
