/**
 * Live validation for the Aave v4 adapter: finds recent borrowers on each
 * Spoke via Borrow events, runs the real getAaveData pipeline (adapter →
 * formatReserves → formatUserSummary → HF recompute) and diffs the computed
 * health factor against the Spoke's own getUserAccountData.
 * Usage: npx tsx scripts/verifyV4HealthFactor.ts
 */
import { ethers } from "ethers";

import { getAaveData } from "../pages/api/aave";
import { markets, AaveMarketDataType } from "../hooks/useAaveData";
import { getV4MarketData } from "../utils/spokeDataProviderV4";

// Keyless public endpoint so this probe needs no env; the app itself uses
// Alchemy via NEXT_PUBLIC_ALCHEMY_API_KEY.
const RPC = "https://ethereum-rpc.publicnode.com";

const BORROW_TOPIC = ethers.utils.id(
  "Borrow(uint256,address,address,uint256,uint256)",
);

const findRecentBorrowers = async (
  spoke: string,
  latest: number,
): Promise<string[]> => {
  // publicnode gates eth_getLogs behind a token; Blockscout serves the same
  // filter keylessly.
  const url =
    `https://eth.blockscout.com/api?module=logs&action=getLogs` +
    `&fromBlock=${latest - 200_000}&toBlock=${latest}` +
    `&address=${spoke}&topic0=${BORROW_TOPIC}`;
  const response = await fetch(url);
  const json: any = await response.json();
  if (!Array.isArray(json.result)) throw new Error(String(json.result));
  const users = json.result.map((log: any) =>
    ethers.utils.getAddress(`0x${log.topics[3].slice(26)}`),
  );
  return [...new Set<string>(users)].slice(0, 2);
};

(async () => {
  const provider = new ethers.providers.StaticJsonRpcProvider(RPC, 1);
  const latest = await provider.getBlockNumber();

  const v4Markets = markets.filter((m) => m.v4);
  let checked = 0;
  let worstDrift = 0;

  for (const market of v4Markets) {
    const testMarket: AaveMarketDataType = { ...market, api: RPC };
    const spoke = market.v4Addresses!.SPOKE;

    let users: string[] = [];
    try {
      users = await findRecentBorrowers(spoke, latest);
    } catch (e: any) {
      console.log(`${market.id}: getLogs failed (${e.message})`);
      continue;
    }
    if (!users.length) {
      console.log(`${market.id}: no recent borrowers found`);
      continue;
    }

    for (const user of users) {
      const [hf, onChain] = await Promise.all([
        getAaveData(user, testMarket, user),
        getV4MarketData(
          {
            provider,
            spokeAddress: spoke,
            oracleAddress: market.v4Addresses!.ORACLE,
            chainId: 1,
          },
          user,
        ),
      ]);
      const computed = hf.workingData?.healthFactor ?? -1;
      const expected = onChain.accountData.healthFactor;
      // No debt: the chain reports HF = max-uint (effectively infinite); the
      // app reports its -1 sentinel. Both mean the same thing.
      const noDebtOnBothSides = expected > 1e18 && computed === -1;
      const drift =
        expected > 0 && !noDebtOnBothSides
          ? Math.abs(computed - expected) / expected
          : 0;
      worstDrift = Math.max(worstDrift, drift);
      checked += 1;
      const flag = drift > 0.005 ? "  <-- DRIFT" : "";
      console.log(
        `${market.id} ${user}: computed HF=${computed.toFixed(4)} on-chain HF=${expected.toFixed(4)} (${(drift * 100).toFixed(3)}% off, riskPremium=${onChain.accountData.riskPremium}bps)${flag}`,
      );
    }
  }

  console.log(
    `\nchecked ${checked} positions, worst drift ${(worstDrift * 100).toFixed(3)}%`,
  );
  if (!checked) process.exitCode = 1;
})();
