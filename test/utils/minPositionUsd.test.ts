import {
  MIN_FETCHED_POSITION_USD,
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
