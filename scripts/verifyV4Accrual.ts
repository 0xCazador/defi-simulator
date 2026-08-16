/**
 * Live validation for the Aave v4 accrual scan: runs the real getAccrualData
 * path (Spoke event scan → net-principal identity → share-price ledger) for
 * users with live positions and prints the resulting ledgers.
 * Usage: npx tsx scripts/verifyV4Accrual.ts <user> [marketId]
 */
import { getAccrualData } from "../pages/api/aave/accrual";
import { getAaveData } from "../pages/api/aave";
import { markets } from "../hooks/useAaveData";

// Keyless endpoints: publicnode for calls, Blockscout for event queries.
const RPC = "https://ethereum-rpc.publicnode.com";
const LOG_API = "https://eth.blockscout.com/api";

(async () => {
  const user = process.argv[2] ?? "0x1107Cc8eE534ebd65c65861FEC385848E0F0Cc48";
  const marketId = process.argv[3] ?? "ETHEREUM_V4_MAIN";
  const market = {
    ...markets.find((m) => m.id === marketId)!,
    api: RPC,
    logApi: LOG_API,
  };

  const hf = await getAaveData(user, market, user);
  const positions = [
    ...(hf.fetchedData?.userReservesData ?? []).map((item) => ({
      symbol: item.asset.symbol,
      side: "supply" as const,
      ref: item.asset.aTokenAddress!,
      balance: item.underlyingBalance,
    })),
    ...(hf.fetchedData?.userBorrowsData ?? []).map((item) => ({
      symbol: item.asset.symbol,
      side: "borrow" as const,
      ref: item.asset.variableDebtTokenAddress!,
      balance: item.totalBorrows,
    })),
  ];
  console.log(
    `${marketId} ${user}: ${positions.length} positions, HF=${hf.fetchedData?.healthFactor.toFixed(4)}`,
  );

  for (const position of positions) {
    const data = await getAccrualData(
      market,
      user,
      position.ref,
      position.side,
      true,
    );
    console.log(
      `\n${position.symbol} (${position.side}, ref ${position.ref}): balance=${position.balance}`,
    );
    console.log(
      `  accrued=${data.accruedValue} realized=${data.realizedValue} pending=${data.pendingValue} events=${data.eventCount} since=${
        data.sinceTimestamp
          ? new Date(data.sinceTimestamp * 1000).toISOString().slice(0, 10)
          : "n/a"
      }`,
    );
    data.ledger?.forEach((row) =>
      console.log(
        `  ${new Date((row.timestamp ?? 0) * 1000).toISOString().slice(0, 10)} ${row.action.padEnd(10)} principal=${row.principalDelta} interest=${row.interestRealized}`,
      ),
    );
  }
})();
