import { getAccruedBorrowInterest, getAccruedSupplyInterest } from "../../utils/accruedInterest";
import { TxHistoryItem, TxHistoryReserveItem } from "../../hooks/useAaveData";

const USDC: TxHistoryReserveItem = {
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
    underlyingAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

const WETH: TxHistoryReserveItem = {
    symbol: "WETH",
    decimals: 18,
    name: "Wrapped Ether",
    underlyingAsset: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
};

const usdcAsset = { symbol: "USDC", underlyingAsset: USDC.underlyingAsset };
const wethAsset = { symbol: "WETH", underlyingAsset: WETH.underlyingAsset };

let txId = 0;
const tx = (partial: Partial<TxHistoryItem>): TxHistoryItem => ({
    id: `tx-${txId}`,
    txHash: `0xhash${txId}`,
    action: "Supply",
    timestamp: 1700000000 + (txId += 1) * 1000,
    ...partial,
} as TxHistoryItem);

// helper: raw base units for USDC (6 decimals)
const usdcRaw = (value: number): string => String(Math.round(value * 1e6));

describe("getAccruedSupplyInterest", () => {
    it("computes interest as balance + withdrawals - supplies", () => {
        const history = [
            tx({ action: "Supply", amount: usdcRaw(100), reserve: USDC }),
            tx({ action: "RedeemUnderlying", amount: usdcRaw(30), reserve: USDC }),
        ];
        // supplied 100, withdrew 30, current balance 80 => accrued 10
        const result = getAccruedSupplyInterest(80, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(10, 6);
        expect(result.oldestPrincipalTx?.action).toBe("Supply");
    });

    it("supports the v2 Deposit and Withdraw action aliases", () => {
        const history = [
            tx({ action: "Deposit", amount: usdcRaw(50), reserve: USDC }),
            tx({ action: "Withdraw", amount: usdcRaw(20), reserve: USDC }),
        ];
        const result = getAccruedSupplyInterest(31, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(1, 6);
        expect(result.oldestPrincipalTx?.action).toBe("Deposit");
    });

    it("ignores transactions for other assets", () => {
        const history = [
            tx({ action: "Supply", amount: usdcRaw(100), reserve: USDC }),
            tx({ action: "Supply", amount: "5000000000000000000", reserve: WETH }),
            tx({ action: "RedeemUnderlying", amount: "1000000000000000000", reserve: WETH }),
        ];
        const result = getAccruedSupplyInterest(101, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(1, 6);
    });

    it("matches by underlying asset address, not just symbol", () => {
        // bridged token with the same symbol but a different address must not match
        const bridgedUSDC: TxHistoryReserveItem = { ...USDC, underlyingAsset: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8" };
        const history = [
            tx({ action: "Supply", amount: usdcRaw(100), reserve: bridgedUSDC }),
        ];
        const result = getAccruedSupplyInterest(100, usdcAsset, history);
        // no matching supply -> no principal tx and untouched balance
        expect(result.accruedValue).toBe(100);
        expect(result.oldestPrincipalTx).toBeUndefined();
    });

    it("falls back to symbol matching when addresses are unavailable", () => {
        const noAddressReserve: TxHistoryReserveItem = { ...USDC, underlyingAsset: "" };
        const history = [
            tx({ action: "Supply", amount: usdcRaw(100), reserve: noAddressReserve }),
        ];
        const result = getAccruedSupplyInterest(101, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(1, 6);
    });

    it("treats seized collateral as a withdrawal", () => {
        const history = [
            tx({ action: "Supply", amount: usdcRaw(100), reserve: USDC }),
            tx({
                action: "LiquidationCall",
                collateralAmount: usdcRaw(40),
                collateralReserve: USDC,
                principalAmount: "10000000000000000000",
                principalReserve: WETH,
            }),
        ];
        // supplied 100, 40 seized, balance now 62 => accrued 2
        const result = getAccruedSupplyInterest(62, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(2, 6);
    });

    it("ignores liquidation debt repayment on the supply side", () => {
        const history = [
            tx({ action: "Supply", amount: usdcRaw(100), reserve: USDC }),
            // user's USDC *debt* was repaid by a liquidator; their USDC supply is unaffected
            tx({
                action: "LiquidationCall",
                collateralAmount: "10000000000000000000",
                collateralReserve: WETH,
                principalAmount: usdcRaw(40),
                principalReserve: USDC,
            }),
        ];
        const result = getAccruedSupplyInterest(101, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(1, 6);
    });

    it("processes history regardless of input order", () => {
        const supply = tx({ action: "Supply", amount: usdcRaw(100), reserve: USDC });
        const withdraw = tx({ action: "RedeemUnderlying", amount: usdcRaw(30), reserve: USDC });
        const result = getAccruedSupplyInterest(80, usdcAsset, [withdraw, supply]);
        expect(result.accruedValue).toBeCloseTo(10, 6);
        expect(result.oldestPrincipalTx?.id).toBe(supply.id);
    });
});

describe("getAccruedBorrowInterest", () => {
    it("computes interest as debt + repayments - borrows", () => {
        const history = [
            tx({ action: "Borrow", amount: usdcRaw(100), reserve: USDC }),
            tx({ action: "Repay", amount: usdcRaw(50), reserve: USDC }),
        ];
        // borrowed 100, repaid 50, current debt 60 => accrued 10
        const result = getAccruedBorrowInterest(60, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(10, 6);
        expect(result.oldestPrincipalTx?.action).toBe("Borrow");
    });

    it("treats liquidation debt repayment as a repay", () => {
        const history = [
            tx({ action: "Borrow", amount: usdcRaw(100), reserve: USDC }),
            tx({
                action: "LiquidationCall",
                collateralAmount: "10000000000000000000",
                collateralReserve: WETH,
                principalAmount: usdcRaw(60),
                principalReserve: USDC,
            }),
        ];
        // borrowed 100, liquidator repaid 60, current debt 45 => accrued 5
        const result = getAccruedBorrowInterest(45, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(5, 6);
    });

    it("ignores seized collateral on the borrow side", () => {
        const history = [
            tx({ action: "Borrow", amount: usdcRaw(100), reserve: USDC }),
            // the user's USDC collateral was seized to repay WETH debt; USDC debt unaffected
            tx({
                action: "LiquidationCall",
                collateralAmount: usdcRaw(500),
                collateralReserve: USDC,
                principalAmount: "10000000000000000000",
                principalReserve: WETH,
            }),
        ];
        const result = getAccruedBorrowInterest(101, usdcAsset, history);
        expect(result.accruedValue).toBeCloseTo(1, 6);
    });

    it("returns no principal tx when the debt has no Borrow in history", () => {
        const history = [
            tx({ action: "Repay", amount: usdcRaw(10), reserve: USDC }),
        ];
        const result = getAccruedBorrowInterest(100, usdcAsset, history);
        expect(result.oldestPrincipalTx).toBeUndefined();
    });
});
