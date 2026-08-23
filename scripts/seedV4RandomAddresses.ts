/**
 * Find ~2 live CDPs per Aave v4 Spoke and print a seed list for
 * RandomAddressButton. Borrowers are harvested from Blockscout logs,
 * ranked by Spoke.getUserAccountData (Multicall3), then confirmed via
 * Aave GraphQL so the random-address button (no ?market=) actually opens
 * that spoke — wallets whose largest position is on v3 or another spoke
 * are skipped.
 *
 * Usage: npx tsx scripts/seedV4RandomAddresses.ts
 */
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { markets } from "../hooks/useAaveData";

const RPC = "https://ethereum-rpc.publicnode.com";
const LOGS = "https://eth.blockscout.com/api";
const START_BLOCK = 24_700_000;
const PER_MARKET = 2;
const GRAPHQL_CANDIDATES = 20;
const MIN_COLLATERAL_USD = 1;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const BATCH = 80;
const V3_ETH_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

const BORROW_TOPIC = ethers.utils.id(
  "Borrow(uint256,address,address,uint256,uint256)",
);
const SUPPLY_TOPIC = ethers.utils.id(
  "Supply(uint256,address,address,uint256,uint256)",
);

const SPOKE_IFACE = new ethers.utils.Interface([
  "function getUserAccountData(address user) view returns (tuple(uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount))",
]);
const MULTICALL_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];

/** GraphQL spoke name → our market id. */
const SPOKE_MARKET: Record<string, string> = {
  Main: "ETHEREUM_V4_MAIN",
  Lido: "ETHEREUM_V4_LIDO",
  Etherfi: "ETHEREUM_V4_ETHERFI",
  Kelp: "ETHEREUM_V4_KELP",
  Lombard: "ETHEREUM_V4_LOMBARD",
  Gold: "ETHEREUM_V4_GOLD",
  Forex: "ETHEREUM_V4_FOREX",
  Bluechip: "ETHEREUM_V4_BLUECHIP",
  "Ethena Ecosystem": "ETHEREUM_V4_ETHENA",
  "Ethena Correlated": "ETHEREUM_V4_ETHENA_CORRELATED",
};

type SeedRow = {
  marketId: string;
  address: string;
  collateralUsd: number;
  debtUsd: number;
  healthFactor: number;
};

const explorerNumber = (value: string | number) => {
  if (typeof value === "number") return value;
  if (value === "0x") return 0;
  return value.startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const gql = async (
  url: string,
  query: string,
  variables: Record<string, unknown>,
) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
};

/** Unique users from a Spoke event, paging Blockscout from START_BLOCK. */
const fetchUsers = async (
  spoke: string,
  topic0: string,
  fromBlockStart: number,
) => {
  const used = new Set<string>();
  let fromBlock = fromBlockStart;
  for (let page = 0; page < 40; page += 1) {
    const url =
      `${LOGS}?module=logs&action=getLogs` +
      `&fromBlock=${fromBlock}&toBlock=latest` +
      `&address=${spoke}&topic0=${topic0}` +
      `&page=1&offset=1000`;
    const res = await fetch(url);
    const json: any = await res.json();
    if (!Array.isArray(json.result) || json.result.length === 0) break;
    let lastBlock = fromBlock;
    json.result.forEach((log: any) => {
      const userTopic = log.topics?.[3];
      if (typeof userTopic !== "string" || userTopic.length < 66) return;
      used.add(ethers.utils.getAddress(`0x${userTopic.slice(26)}`));
      lastBlock = Math.max(lastBlock, explorerNumber(log.blockNumber));
    });
    if (json.result.length < 1000 || lastBlock <= fromBlock) break;
    fromBlock = lastBlock;
    await sleep(150);
  }
  return [...used];
};

const scoreUsers = async (
  provider: ethers.providers.Provider,
  spoke: string,
  marketId: string,
  users: string[],
): Promise<SeedRow[]> => {
  const multicall = new ethers.Contract(MULTICALL3, MULTICALL_ABI, provider);
  const rows: SeedRow[] = [];
  for (let i = 0; i < users.length; i += BATCH) {
    const chunk = users.slice(i, i + BATCH);
    const calls = chunk.map((user) => ({
      target: spoke,
      allowFailure: true,
      callData: SPOKE_IFACE.encodeFunctionData("getUserAccountData", [user]),
    }));
    const results: { success: boolean; returnData: string }[] =
      await multicall.callStatic.aggregate3(calls);
    results.forEach((result, idx) => {
      if (!result.success || result.returnData === "0x") return;
      try {
        const decoded = SPOKE_IFACE.decodeFunctionResult(
          "getUserAccountData",
          result.returnData,
        );
        const data = decoded[0];
        // Value is WAD-scaled 8-decimal USD (26 decimals); debt adds RAY (53).
        const collateralUsd =
          Number(data.totalCollateralValue.toString()) / 1e26;
        const debtUsd = Number(data.totalDebtValueRay.toString()) / 1e53;
        const hf = Number(ethers.utils.formatUnits(data.healthFactor, 18));
        if (!(collateralUsd > 0)) return;
        rows.push({
          marketId,
          address: chunk[idx].toLowerCase(),
          collateralUsd,
          debtUsd,
          healthFactor: hf > 1e18 ? -1 : hf,
        });
      } catch {
        // skip undecodable rows
      }
    });
  }
  return rows;
};

const v4Positions = async (user: string) => {
  const json = await gql(
    "https://api.v4.aave.com/graphql",
    `query($user: EvmAddress!) {
      userPositions(request: { user: $user, filter: { chainIds: [1] }, orderBy: { netCollateral: DESC } }) {
        spoke { name }
        healthFactor { current }
        totalCollateral { current { value } }
        totalDebt { current { value } }
      }
    }`,
    { user },
  );
  return ((json.data?.userPositions as any[]) || []).map((p) => ({
    marketId: SPOKE_MARKET[p.spoke.name] || p.spoke.name,
    spokeName: p.spoke.name as string,
    coll: Number(p.totalCollateral.current.value),
    debt: Number(p.totalDebt.current.value),
    hf: p.healthFactor?.current == null ? -1 : Number(p.healthFactor.current),
  }));
};

const v3EthCollateral = async (user: string) => {
  const json = await gql(
    "https://api.v3.aave.com/graphql",
    `query($m: EvmAddress!, $c: ChainId!, $u: EvmAddress!) {
      userMarketState(request: { market: $m, chainId: $c, user: $u }) {
        totalCollateralBase
      }
    }`,
    { m: V3_ETH_POOL, c: 1, u: user },
  );
  return Number(json.data?.userMarketState?.totalCollateralBase) || 0;
};

const v3CollateralByAddress = new Map<string, number>();
try {
  const generated = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "randomAddresses.generated.json"),
      "utf8",
    ),
  ) as { address: string; marketId: string; collateralUsd?: number }[];
  generated.forEach((row) => {
    if (!row.marketId.includes("V3") || !row.collateralUsd) return;
    const prev = v3CollateralByAddress.get(row.address) || 0;
    if (row.collateralUsd > prev) {
      v3CollateralByAddress.set(row.address, row.collateralUsd);
    }
  });
} catch {
  // generated file is optional
}

(async () => {
  const provider = new ethers.providers.StaticJsonRpcProvider(RPC, 1);
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(START_BLOCK, latest - 2_000_000);
  const seeds: SeedRow[] = [];
  const used = new Set<string>();

  for (const market of markets.filter((m) => m.v4)) {
    const spoke = market.v4Addresses!.SPOKE;
    let candidates = await fetchUsers(spoke, BORROW_TOPIC, fromBlock);
    if (candidates.length < 20) {
      const suppliers = await fetchUsers(spoke, SUPPLY_TOPIC, fromBlock);
      candidates = [...new Set([...candidates, ...suppliers])];
    }
    console.log(`${market.id}: scoring ${candidates.length} users`);

    const scored = (await scoreUsers(provider, spoke, market.id, candidates))
      .filter((row) => row.debtUsd > 0 && row.healthFactor > 1.01)
      .sort(
        (a, b) => b.collateralUsd + b.debtUsd - (a.collateralUsd + a.debtUsd),
      );

    const picked: SeedRow[] = [];
    for (const row of scored.slice(0, GRAPHQL_CANDIDATES)) {
      if (picked.length >= PER_MARKET) break;
      if (used.has(row.address)) continue;
      const [positions, v3Coll] = await Promise.all([
        v4Positions(row.address),
        v3EthCollateral(row.address),
      ]);
      const here = positions.find((p) => p.marketId === market.id);
      if (
        !here ||
        here.coll < MIN_COLLATERAL_USD ||
        here.debt <= 0 ||
        here.hf <= 1.01
      ) {
        continue;
      }
      const bestOurs = positions
        .filter((p) => p.marketId.startsWith("ETHEREUM_V4_"))
        .sort((a, b) => b.coll - a.coll)[0];
      if (bestOurs && bestOurs.marketId !== market.id) {
        console.log(
          `  skip ${row.address}  larger on ${bestOurs.spokeName} ($${bestOurs.coll.toFixed(0)})`,
        );
        continue;
      }
      const knownV3 = v3CollateralByAddress.get(row.address) || 0;
      const maxV3 = Math.max(v3Coll, knownV3);
      if (maxV3 > here.coll) {
        console.log(
          `  skip ${row.address}  v3 $${maxV3.toFixed(0)} > spoke $${here.coll.toFixed(0)}`,
        );
        continue;
      }
      const seed = {
        marketId: market.id,
        address: row.address,
        collateralUsd: Math.round(here.coll),
        debtUsd: Math.round(here.debt),
        healthFactor: Number(here.hf.toFixed(3)),
      };
      picked.push(seed);
      used.add(row.address);
      console.log(
        `  ${seed.address}  coll $${seed.collateralUsd.toFixed(0)}  debt $${seed.debtUsd.toFixed(0)}  HF ${seed.healthFactor.toFixed(3)}`,
      );
    }

    if (!picked.length) {
      console.log("  no usable positions");
      continue;
    }
    seeds.push(...picked);
  }

  console.log("\nPaste-ready addresses:");
  console.log(
    JSON.stringify(
      seeds.map((s) => s.address),
      null,
      2,
    ),
  );
  console.log("\nSeed rows:");
  console.log(JSON.stringify(seeds, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
