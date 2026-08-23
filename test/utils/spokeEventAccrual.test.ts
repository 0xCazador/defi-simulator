import { ethers } from "ethers";

import {
  SpokeFlowEvent,
  buildLedgerV4,
  decodeV4PositionRef,
  encodeV4PositionRef,
  findFirstPrincipalEventV4,
  getAccruedInterestV4,
  getNetPrincipalV4,
  getPrincipalFlowV4,
  getRealizedInterestV4,
} from "../../utils/spokeEventAccrual";

let eventOrder = 0;
const event = (
  partial: Partial<SpokeFlowEvent> & Pick<SpokeFlowEvent, "kind" | "amount">,
): SpokeFlowEvent => {
  eventOrder += 1;
  return {
    shares: "0",
    blockNumber: eventOrder,
    logIndex: 0,
    ...partial,
  };
};

// USDC-style base units (6 decimals)
const usdc = (value: number): string => String(Math.round(value * 1e6));

describe("getPrincipalFlowV4", () => {
  it("treats Supply and Borrow as inflows at face value", () => {
    expect(
      getPrincipalFlowV4(
        event({ kind: "Supply", amount: usdc(100) }),
      ).toString(),
    ).toBe(usdc(100));
    expect(
      getPrincipalFlowV4(
        event({ kind: "Borrow", amount: usdc(50) }),
      ).toString(),
    ).toBe(usdc(50));
  });

  it("treats Withdraw, Repay and liquidations as outflows", () => {
    expect(
      getPrincipalFlowV4(
        event({ kind: "Withdraw", amount: usdc(30) }),
      ).toString(),
    ).toBe(usdc(-30));
    expect(
      getPrincipalFlowV4(event({ kind: "Repay", amount: usdc(20) })).toString(),
    ).toBe(usdc(-20));
    expect(
      getPrincipalFlowV4(
        event({ kind: "CollateralLiquidated", amount: usdc(40) }),
      ).toString(),
    ).toBe(usdc(-40));
    expect(
      getPrincipalFlowV4(
        event({ kind: "DebtLiquidated", amount: usdc(60) }),
      ).toString(),
    ).toBe(usdc(-60));
  });
});

describe("getAccruedInterestV4", () => {
  it("computes supply interest through a supply/withdraw cycle", () => {
    const events = [
      event({ kind: "Supply", amount: usdc(100) }),
      event({ kind: "Withdraw", amount: usdc(30) }),
    ];
    // net principal 70; current supplied assets 75 -> lifetime interest 5
    expect(getAccruedInterestV4(usdc(75), events).toString()).toBe(usdc(5));
  });

  it("computes debt interest through a borrow/repay cycle", () => {
    const events = [
      event({ kind: "Borrow", amount: usdc(100) }),
      // totalAmountRepaid includes premium debt, matching getUserTotalDebt
      event({ kind: "Repay", amount: usdc(50) }),
    ];
    // net principal 50; current total debt 58 -> interest owed 8
    expect(getAccruedInterestV4(usdc(58), events).toString()).toBe(usdc(8));
  });

  it("nets liquidations out of the debt side", () => {
    const events = [
      event({ kind: "Borrow", amount: usdc(100) }),
      event({ kind: "DebtLiquidated", amount: usdc(60) }),
    ];
    // net principal 40; remaining debt 50 -> interest owed 10
    expect(getAccruedInterestV4(usdc(50), events).toString()).toBe(usdc(10));
  });

  it("nets liquidations out of the supply side", () => {
    const events = [
      event({ kind: "Supply", amount: usdc(100) }),
      event({ kind: "CollateralLiquidated", amount: usdc(70) }),
    ];
    // net principal 30; remaining supplied 32 -> interest earned 2
    expect(getAccruedInterestV4(usdc(32), events).toString()).toBe(usdc(2));
  });

  it("handles a fully closed position (interest fully realized)", () => {
    const events = [
      event({ kind: "Supply", amount: usdc(100) }),
      event({ kind: "Withdraw", amount: usdc(108) }),
    ];
    // withdrew 108 on 100 supplied; balance 0 -> lifetime interest 8
    expect(getAccruedInterestV4(usdc(0), events).toString()).toBe(usdc(8));
  });

  it("returns zero for an empty history and zero balance", () => {
    expect(getAccruedInterestV4("0", []).toString()).toBe("0");
    expect(getNetPrincipalV4([]).toString()).toBe("0");
  });
});

describe("findFirstPrincipalEventV4", () => {
  it("finds the earliest principal-adding event by chain order", () => {
    const later = event({ kind: "Supply", amount: usdc(50) });
    const earlier = event({
      kind: "Supply",
      amount: usdc(100),
      blockNumber: 1,
    });
    expect(findFirstPrincipalEventV4([later, earlier])).toBe(earlier);
  });

  it("skips outflows and zero-amount inflows", () => {
    const withdraw = event({ kind: "Withdraw", amount: usdc(10) });
    const emptySupply = event({ kind: "Supply", amount: "0" });
    const borrow = event({ kind: "Borrow", amount: usdc(5) });
    expect(findFirstPrincipalEventV4([withdraw, emptySupply, borrow])).toBe(
      borrow,
    );
  });

  it("returns undefined when nothing added principal", () => {
    expect(findFirstPrincipalEventV4([])).toBeUndefined();
    expect(
      findFirstPrincipalEventV4([event({ kind: "Repay", amount: usdc(1) })]),
    ).toBeUndefined();
  });
});

describe("buildLedgerV4", () => {
  it("reconstructs realized interest from share-price movement", () => {
    const events = [
      // 100 supplied at share price 1.00
      event({
        kind: "Supply",
        amount: usdc(100),
        shares: usdc(100),
        blockNumber: 100,
        transactionHash: "0xaaa",
        timestamp: 1000,
      }),
      // withdraw 31.5 for 30 shares: share price 1.05 -> 100 held shares
      // realized 5 since the supply
      event({
        kind: "Withdraw",
        amount: usdc(31.5),
        shares: usdc(30),
        blockNumber: 200,
        transactionHash: "0xbbb",
        timestamp: 2000,
      }),
      // supply 11 for 10 shares: share price 1.10 -> 70 held shares
      // realized 3.5 since the withdrawal
      event({
        kind: "Supply",
        amount: usdc(11),
        shares: usdc(10),
        blockNumber: 300,
        transactionHash: "0xccc",
        timestamp: 3000,
      }),
    ];

    const ledger = buildLedgerV4(events);

    expect(ledger.map((entry) => entry.action)).toEqual([
      "Supply",
      "Withdraw",
      "Supply",
    ]);
    expect(ledger[0]).toMatchObject({
      principalDelta: usdc(100),
      interestRealized: "0",
      blockNumber: 100,
      transactionHash: "0xaaa",
      timestamp: 1000,
    });
    expect(ledger[1]).toMatchObject({
      principalDelta: usdc(-31.5),
      interestRealized: usdc(5),
      blockNumber: 200,
    });
    expect(ledger[2]).toMatchObject({
      principalDelta: usdc(11),
      interestRealized: usdc(3.5),
      blockNumber: 300,
    });

    expect(getRealizedInterestV4(events).toString()).toBe(usdc(8.5));
  });

  it("orders entries by block then log index", () => {
    const second = event({
      kind: "Supply",
      amount: usdc(50),
      blockNumber: 100,
      logIndex: 7,
    });
    const first = event({
      kind: "Borrow",
      amount: usdc(10),
      blockNumber: 100,
      logIndex: 2,
    });
    expect(buildLedgerV4([second, first]).map((e) => e.action)).toEqual([
      "Borrow",
      "Supply",
    ]);
  });

  it("labels both liquidation kinds as Liquidation", () => {
    const ledger = buildLedgerV4([
      event({ kind: "CollateralLiquidated", amount: usdc(40) }),
      event({ kind: "DebtLiquidated", amount: usdc(20) }),
    ]);
    expect(ledger.map((entry) => entry.action)).toEqual([
      "Liquidation",
      "Liquidation",
    ]);
    expect(ledger[0].principalDelta).toBe(usdc(-40));
  });

  it("realizes zero on events without usable share data", () => {
    const ledger = buildLedgerV4([
      event({ kind: "Supply", amount: usdc(100), shares: usdc(100) }),
      // e.g. a liquidation log that carries no share count
      event({ kind: "CollateralLiquidated", amount: usdc(40), shares: "0" }),
    ]);
    expect(ledger[1].interestRealized).toBe("0");
  });

  it("clamps negative share-price deltas to zero realized interest", () => {
    const events = [
      event({ kind: "Borrow", amount: usdc(100), shares: usdc(100) }), // price 1.00
      event({ kind: "Repay", amount: usdc(102), shares: usdc(100) }), // price 1.02, realized 2
      // premium-bearing repays can price below the previous event; that must
      // not produce negative realized interest
      event({ kind: "Repay", amount: usdc(50), shares: usdc(50) }), // price 1.00 < 1.02
    ];
    const ledger = buildLedgerV4(events);
    expect(ledger[1].interestRealized).toBe(usdc(2));
    expect(ledger[2].interestRealized).toBe("0");
  });
});

describe("encodeV4PositionRef / decodeV4PositionRef", () => {
  it("round-trips reserve ids on both sides", () => {
    expect(decodeV4PositionRef(encodeV4PositionRef(0, "supply"))).toBe(0);
    expect(decodeV4PositionRef(encodeV4PositionRef(0, "borrow"))).toBe(0);
    expect(decodeV4PositionRef(encodeV4PositionRef(123, "supply"))).toBe(123);
    expect(decodeV4PositionRef(encodeV4PositionRef(65535, "borrow"))).toBe(
      65535,
    );
  });

  it("produces valid, side-distinct, address-shaped refs", () => {
    const supplyRef = encodeV4PositionRef(7, "supply");
    const borrowRef = encodeV4PositionRef(7, "borrow");

    // must tunnel through ethers.utils.isAddress request validation
    expect(ethers.utils.isAddress(supplyRef)).toBe(true);
    expect(ethers.utils.isAddress(borrowRef)).toBe(true);
    expect(supplyRef).not.toBe(borrowRef);
    expect(supplyRef.toLowerCase().startsWith("0xaa")).toBe(true);
    expect(borrowRef.toLowerCase().startsWith("0xbb")).toBe(true);
  });

  it("gives every (reserveId, side) pair a unique ref", () => {
    const refs = new Set<string>();
    for (let id = 0; id < 50; id += 1) {
      refs.add(encodeV4PositionRef(id, "supply"));
      refs.add(encodeV4PositionRef(id, "borrow"));
    }
    expect(refs.size).toBe(100);
  });
});
