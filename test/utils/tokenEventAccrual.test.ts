import { BigNumber } from "ethers";

import {
  TokenFlowEvent,
  buildLedger,
  clampRoundingDust,
  classifyEvent,
  findFirstPrincipalEvent,
  getAccruedInterest,
  getNetPrincipal,
  getPendingInterest,
  getPrincipalFlow,
  getRealizedInterest,
} from "../../utils/tokenEventAccrual";

let eventOrder = 0;
const event = (
  partial: Partial<TokenFlowEvent> & Pick<TokenFlowEvent, "kind" | "value">,
): TokenFlowEvent => {
  eventOrder += 1;
  return {
    blockNumber: eventOrder,
    logIndex: 0,
    ...partial,
  };
};

// USDC-style base units (6 decimals)
const usdc = (value: number): string => String(Math.round(value * 1e6));

describe("getPrincipalFlow", () => {
  it("separates principal from credited interest on Mint", () => {
    // supplied 100 while 2 of interest had accrued -> event value is 102
    const flow = getPrincipalFlow(
      event({ kind: "Mint", value: usdc(102), balanceIncrease: usdc(2) }),
    );
    expect(flow.toString()).toBe(usdc(100));
  });

  it("handles the burn-side Mint (withdrawal smaller than accrued interest)", () => {
    // withdrew 5 while 8 of interest had accrued -> Mint with value 3
    const flow = getPrincipalFlow(
      event({ kind: "Mint", value: usdc(3), balanceIncrease: usdc(8) }),
    );
    expect(flow.toString()).toBe(usdc(-5));
  });

  it("adds credited interest back to the principal on Burn", () => {
    // withdrew 100 while 2 of interest had accrued -> Burn with value 98
    const flow = getPrincipalFlow(
      event({ kind: "Burn", value: usdc(98), balanceIncrease: usdc(2) }),
    );
    expect(flow.toString()).toBe(usdc(-100));
  });

  it("treats transfers at face value", () => {
    expect(
      getPrincipalFlow(
        event({ kind: "TransferIn", value: usdc(50) }),
      ).toString(),
    ).toBe(usdc(50));
    expect(
      getPrincipalFlow(
        event({ kind: "TransferOut", value: usdc(50) }),
      ).toString(),
    ).toBe(usdc(-50));
  });
});

describe("getAccruedInterest", () => {
  it("computes supply interest through a supply/withdraw cycle", () => {
    const events = [
      event({ kind: "Mint", value: usdc(100), balanceIncrease: usdc(0) }), // supply 100
      event({ kind: "Burn", value: usdc(28), balanceIncrease: usdc(2) }), // withdraw 30 after accruing 2
    ];
    // net principal 70; current balance 75 -> total interest 5 (2 credited + 3 residual)
    expect(getAccruedInterest(usdc(75), events).toString()).toBe(usdc(5));
  });

  it("computes debt interest through a borrow/repay cycle", () => {
    const events = [
      event({ kind: "Mint", value: usdc(100), balanceIncrease: usdc(0) }), // borrow 100
      event({ kind: "Burn", value: usdc(45), balanceIncrease: usdc(5) }), // repay 50 after accruing 5
    ];
    // net principal 50; current debt 58 -> total interest 8 (5 accrued at repay + 3 since)
    expect(getAccruedInterest(usdc(58), events).toString()).toBe(usdc(8));
  });

  it("counts aToken transfers as principal flows", () => {
    const events = [
      event({ kind: "Mint", value: usdc(100), balanceIncrease: usdc(0) }),
      event({ kind: "TransferOut", value: usdc(40) }), // e.g. collateral switch or seizure
      event({ kind: "TransferIn", value: usdc(10) }), // received aTokens from another wallet
    ];
    // net principal 70; balance 71 -> interest 1
    expect(getAccruedInterest(usdc(71), events).toString()).toBe(usdc(1));
  });

  it("handles a position acquired only via transfer", () => {
    const events = [event({ kind: "TransferIn", value: usdc(100) })];
    expect(getAccruedInterest(usdc(103), events).toString()).toBe(usdc(3));
  });

  it("handles a fully closed position (interest fully realized)", () => {
    const events = [
      event({ kind: "Mint", value: usdc(100), balanceIncrease: usdc(0) }),
      event({ kind: "Burn", value: usdc(104), balanceIncrease: usdc(4) }), // withdraw everything: 108
    ];
    // net principal -8; balance 0 -> lifetime interest 8... withdrawal was 108 on 100 supplied
    expect(getAccruedInterest(usdc(0), events).toString()).toBe(usdc(8));
  });

  it("returns zero for an empty history and zero balance", () => {
    expect(getAccruedInterest("0", []).toString()).toBe("0");
    expect(getNetPrincipal([]).toString()).toBe("0");
  });
});

describe("findFirstPrincipalEvent", () => {
  it("finds the earliest principal-adding event by chain order", () => {
    const later = event({
      kind: "Mint",
      value: usdc(50),
      balanceIncrease: usdc(0),
    });
    const earlier = event({
      kind: "Mint",
      value: usdc(100),
      balanceIncrease: usdc(0),
      blockNumber: 1,
    });
    const found = findFirstPrincipalEvent([later, earlier]);
    expect(found).toBe(earlier);
  });

  it("skips burn-side Mints (they remove principal)", () => {
    const burnSideMint = event({
      kind: "Mint",
      value: usdc(3),
      balanceIncrease: usdc(8),
    });
    const transferIn = event({ kind: "TransferIn", value: usdc(10) });
    const found = findFirstPrincipalEvent([burnSideMint, transferIn]);
    expect(found).toBe(transferIn);
  });

  it("returns undefined when nothing added principal", () => {
    expect(findFirstPrincipalEvent([])).toBeUndefined();
    expect(
      findFirstPrincipalEvent([event({ kind: "TransferOut", value: usdc(1) })]),
    ).toBeUndefined();
  });
});

describe("classifyEvent", () => {
  it("classifies supply-side events", () => {
    expect(
      classifyEvent(
        event({ kind: "Mint", value: usdc(102), balanceIncrease: usdc(2) }),
        "supply",
      ),
    ).toBe("Supply");
    // withdrawal smaller than accrued interest emits a Mint with negative principal
    expect(
      classifyEvent(
        event({ kind: "Mint", value: usdc(3), balanceIncrease: usdc(8) }),
        "supply",
      ),
    ).toBe("Withdraw");
    expect(
      classifyEvent(
        event({ kind: "Burn", value: usdc(98), balanceIncrease: usdc(2) }),
        "supply",
      ),
    ).toBe("Withdraw");
    expect(
      classifyEvent(event({ kind: "TransferIn", value: usdc(50) }), "supply"),
    ).toBe("TransferIn");
    expect(
      classifyEvent(event({ kind: "TransferOut", value: usdc(50) }), "supply"),
    ).toBe("TransferOut");
  });

  it("classifies borrow-side events", () => {
    expect(
      classifyEvent(
        event({ kind: "Mint", value: usdc(102), balanceIncrease: usdc(2) }),
        "borrow",
      ),
    ).toBe("Borrow");
    // repayment smaller than accrued interest emits a Mint with negative principal
    expect(
      classifyEvent(
        event({ kind: "Mint", value: usdc(3), balanceIncrease: usdc(8) }),
        "borrow",
      ),
    ).toBe("Repay");
    expect(
      classifyEvent(
        event({ kind: "Burn", value: usdc(45), balanceIncrease: usdc(5) }),
        "borrow",
      ),
    ).toBe("Repay");
  });

  it("marks zero-principal index updates as interest application", () => {
    const pureInterest = event({
      kind: "Mint",
      value: usdc(2),
      balanceIncrease: usdc(2),
    });
    expect(classifyEvent(pureInterest, "supply")).toBe("InterestApplied");
    expect(classifyEvent(pureInterest, "borrow")).toBe("InterestApplied");
  });
});

describe("buildLedger", () => {
  it("orders entries by chain order and carries event metadata", () => {
    const later = event({
      kind: "Burn",
      value: usdc(28),
      balanceIncrease: usdc(2),
      blockNumber: 200,
      logIndex: 3,
      transactionHash: "0xbbb",
      timestamp: 2000,
    });
    const earlier = event({
      kind: "Mint",
      value: usdc(100),
      balanceIncrease: usdc(0),
      blockNumber: 100,
      logIndex: 1,
      transactionHash: "0xaaa",
      timestamp: 1000,
    });

    const ledger = buildLedger([later, earlier], "supply");

    expect(ledger.map((entry) => entry.action)).toEqual(["Supply", "Withdraw"]);
    expect(ledger[0]).toMatchObject({
      principalDelta: usdc(100),
      interestRealized: usdc(0),
      blockNumber: 100,
      transactionHash: "0xaaa",
      timestamp: 1000,
    });
    expect(ledger[1]).toMatchObject({
      principalDelta: usdc(-30),
      interestRealized: usdc(2),
      blockNumber: 200,
      transactionHash: "0xbbb",
      timestamp: 2000,
    });
  });

  it("orders same-block entries by log index", () => {
    const second = event({
      kind: "Mint",
      value: usdc(50),
      balanceIncrease: usdc(0),
      blockNumber: 100,
      logIndex: 7,
    });
    const first = event({
      kind: "TransferIn",
      value: usdc(10),
      blockNumber: 100,
      logIndex: 2,
    });

    const ledger = buildLedger([second, first], "supply");

    expect(ledger.map((entry) => entry.action)).toEqual([
      "TransferIn",
      "Supply",
    ]);
  });
});

describe("getRealizedInterest / getPendingInterest", () => {
  it("splits lifetime interest into realized and pending parts", () => {
    const events = [
      event({ kind: "Mint", value: usdc(100), balanceIncrease: usdc(0) }), // supply 100
      event({ kind: "Burn", value: usdc(28), balanceIncrease: usdc(2) }), // withdraw 30 after accruing 2
    ];
    // lifetime interest is 5 (see getAccruedInterest suite): 2 realized + 3 pending
    expect(getRealizedInterest(events).toString()).toBe(usdc(2));
    expect(getPendingInterest(usdc(75), events).toString()).toBe(usdc(3));
  });

  it("reports zero pending interest for a fully closed position", () => {
    const events = [
      event({ kind: "Mint", value: usdc(100), balanceIncrease: usdc(0) }),
      // withdrew everything (108): Burn value = amount - balanceIncrease
      event({ kind: "Burn", value: usdc(100), balanceIncrease: usdc(8) }),
    ];
    expect(getRealizedInterest(events).toString()).toBe(usdc(8));
    expect(getPendingInterest(usdc(0), events).toString()).toBe("0");
  });

  it("treats transfers as realizing no interest", () => {
    const events = [event({ kind: "TransferIn", value: usdc(100) })];
    expect(getRealizedInterest(events).toString()).toBe("0");
    expect(getPendingInterest(usdc(103), events).toString()).toBe(usdc(3));
  });
});

describe("clampRoundingDust", () => {
  // Real case: 0%-APY assets like sUSDe can compute a few wei negative purely
  // from ray-math rounding across many events.
  it("clamps a tiny negative within the event-count budget to zero", () => {
    expect(clampRoundingDust(BigNumber.from(-1), 61).toString()).toBe("0");
    expect(clampRoundingDust(BigNumber.from(-62), 61).toString()).toBe("0");
  });

  it("leaves materially negative values alone", () => {
    expect(clampRoundingDust(BigNumber.from(-63), 61).toString()).toBe("-63");
    expect(clampRoundingDust(BigNumber.from(-1_000_000), 61).toString()).toBe(
      "-1000000",
    );
  });

  it("never touches zero or positive values", () => {
    expect(clampRoundingDust(BigNumber.from(0), 61).toString()).toBe("0");
    expect(clampRoundingDust(BigNumber.from(12345), 0).toString()).toBe(
      "12345",
    );
  });
});
