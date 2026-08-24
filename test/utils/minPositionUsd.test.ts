import {
  MIN_FETCHED_POSITION_USD,
  filterFetchedBorrows,
  filterFetchedSupplies,
  isMeaningfulFetchedBorrow,
  isMeaningfulFetchedPositionUsd,
  isMeaningfulFetchedSupply,
} from "../../utils/minPositionUsd";

describe("MIN_FETCHED_POSITION_USD", () => {
  it("is a $1 floor", () => {
    expect(MIN_FETCHED_POSITION_USD).toBe(1);
  });
});

describe("isMeaningfulFetchedPositionUsd", () => {
  it("keeps values at or above the floor, including numeric strings", () => {
    expect(isMeaningfulFetchedPositionUsd(1)).toBe(true);
    expect(isMeaningfulFetchedPositionUsd(1.0)).toBe(true);
    expect(isMeaningfulFetchedPositionUsd("1")).toBe(true);
    expect(isMeaningfulFetchedPositionUsd("1.00")).toBe(true);
    expect(isMeaningfulFetchedPositionUsd(12.34)).toBe(true);
    expect(isMeaningfulFetchedPositionUsd("999.5")).toBe(true);
  });

  it("drops dust strictly under $1", () => {
    expect(isMeaningfulFetchedPositionUsd(0)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(0.99)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd("0.999")).toBe(false);
    expect(isMeaningfulFetchedPositionUsd("1e-8")).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(0.000042)).toBe(false);
  });

  it("rejects non-finite and unparseable values", () => {
    expect(isMeaningfulFetchedPositionUsd(undefined)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(null)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd("")).toBe(false);
    expect(isMeaningfulFetchedPositionUsd("nope")).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(NaN)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(Infinity)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(-Infinity)).toBe(false);
    expect(isMeaningfulFetchedPositionUsd(-1)).toBe(false);
  });
});

describe("isMeaningfulFetchedSupply", () => {
  it("requires both a positive balance and a USD value at the floor", () => {
    expect(
      isMeaningfulFetchedSupply({
        underlyingBalance: "0.5",
        underlyingBalanceUSD: "12.00",
      }),
    ).toBe(true);
    expect(
      isMeaningfulFetchedSupply({
        underlyingBalance: 100,
        underlyingBalanceUSD: 0.5,
      }),
    ).toBe(false);
    expect(
      isMeaningfulFetchedSupply({
        underlyingBalance: "0",
        underlyingBalanceUSD: "50",
      }),
    ).toBe(false);
    expect(
      isMeaningfulFetchedSupply({
        underlyingBalance: "0.0000001",
        underlyingBalanceUSD: "0.003",
      }),
    ).toBe(false);
  });
});

describe("isMeaningfulFetchedBorrow", () => {
  it("requires both positive debt and a USD value at the floor", () => {
    expect(
      isMeaningfulFetchedBorrow({
        totalBorrows: "2",
        totalBorrowsUSD: "2",
      }),
    ).toBe(true);
    expect(
      isMeaningfulFetchedBorrow({
        totalBorrows: "1000",
        totalBorrowsUSD: "0.40",
      }),
    ).toBe(false);
    expect(
      isMeaningfulFetchedBorrow({
        totalBorrows: "0",
        totalBorrowsUSD: "80",
      }),
    ).toBe(false);
  });
});

const supply = (symbol: string, usd: string | number, balance = "1") => ({
  symbol,
  underlyingBalance: balance,
  underlyingBalanceUSD: usd,
});

const borrow = (symbol: string, usd: string | number, amount = "1") => ({
  symbol,
  totalBorrows: amount,
  totalBorrowsUSD: usd,
});

describe("filterFetchedSupplies", () => {
  it("drops dust when another supply is worth at least $1", () => {
    const kept = filterFetchedSupplies([
      supply("USDC", "100"),
      supply("DAI", "0.50"),
      supply("IDLE", "0", "0"),
    ]);
    expect(kept.map((item) => item.symbol)).toEqual(["USDC"]);
  });

  it("keeps every dust supply when that would otherwise empty the list", () => {
    const kept = filterFetchedSupplies([
      supply("DAI", "0.50"),
      supply("ETH", "0.30"),
      supply("IDLE", "0", "0"),
    ]);
    expect(kept.map((item) => item.symbol)).toEqual(["DAI", "ETH"]);
  });

  it("keeps a lone dust supply", () => {
    expect(
      filterFetchedSupplies([supply("DAI", 0.4)]).map((item) => item.symbol),
    ).toEqual(["DAI"]);
  });

  it("returns an empty list when nothing is held", () => {
    expect(filterFetchedSupplies([supply("IDLE", "50", "0")])).toEqual([]);
    expect(filterFetchedSupplies(undefined)).toEqual([]);
    expect(filterFetchedSupplies(null)).toEqual([]);
  });
});

describe("filterFetchedBorrows", () => {
  it("drops dust when another borrow is worth at least $1", () => {
    const kept = filterFetchedBorrows([
      borrow("USDC", "80"),
      borrow("USDT", "0.40"),
    ]);
    expect(kept.map((item) => item.symbol)).toEqual(["USDC"]);
  });

  it("keeps every dust borrow when that would otherwise empty the list", () => {
    const kept = filterFetchedBorrows([
      borrow("USDT", "0.40"),
      borrow("GHO", "0.10"),
    ]);
    expect(kept.map((item) => item.symbol)).toEqual(["USDT", "GHO"]);
  });

  it("keeps a lone dust borrow", () => {
    expect(
      filterFetchedBorrows([borrow("USDT", "0.40")]).map((item) => item.symbol),
    ).toEqual(["USDT"]);
  });
});
