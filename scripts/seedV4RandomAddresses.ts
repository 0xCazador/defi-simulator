/**
 * Find ~2 live CDPs per Aave v4 Spoke and print a seed list for
 * RandomAddressButton. Uses Blockscout logs + Spoke.getUserAccountData.
 *
 * Usage: npx tsx scripts/seedV4RandomAddresses.ts
 */
import { ethers } from "ethers";
import { markets } from "../hooks/useAaveData";

const RPC = "https://ethereum-rpc.publicnode.com";
const LOGS = "https://eth.blockscout.com/api";
const START_BLOCK = 24_700_000;
const PER_MARKET = 2;
const CANDIDATE_CAP = 40;
const CONCURRENCY = 8;

const BORROW_TOPIC = ethers.utils.id(
  "Borrow(uint256,address,address,uint256,uint256)",
);
const SUPPLY_TOPIC = ethers.utils.id(
  "Supply(uint256,address,address,uint256,uint256)",
);

const SPOKE_ABI = [
  "function getUserAccountData(address user) view returns (tuple(uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount))",
];

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

/** Most-recent unique users from a Spoke event, walking Blockscout pages. */
const fetchRecentUsers = async (
  spoke: string,
  topic0: string,
  fromBlockStart: number,
) => {
  const seen: string[] = [];
  const used = new Set<string>();
  let fromBlock = fromBlockStart;
  for (let page = 0; page < 8; page += 1) {
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
      const user = ethers.utils.getAddress(`0x${userTopic.slice(26)}`);
      if (!used.has(user)) {
        used.add(user);
        seen.push(user);
      }
      lastBlock = Math.max(lastBlock, explorerNumber(log.blockNumber));
    });
    if (json.result.length < 200 || lastBlock <= fromBlock) break;
    fromBlock = lastBlock;
  }
  return seen.slice(-CANDIDATE_CAP);
};

const mapPool = async <T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const out: R[] = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, worker),
  );
  return out;
};

(async () => {
  const provider = new ethers.providers.StaticJsonRpcProvider(RPC, 1);
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(START_BLOCK, latest - 800_000);
  const seeds: SeedRow[] = [];

  const fetchForSpoke = (spoke: string, topic0: string) =>
    fetchRecentUsers(spoke, topic0, fromBlock);

  for (const market of markets.filter((m) => m.v4)) {
    const spoke = market.v4Addresses!.SPOKE;
    const contract = new ethers.Contract(spoke, SPOKE_ABI, provider);
    let candidates = await fetchForSpoke(spoke, BORROW_TOPIC);
    if (candidates.length < CANDIDATE_CAP) {
      const suppliers = await fetchForSpoke(spoke, SUPPLY_TOPIC);
      candidates = [...new Set([...candidates, ...suppliers])].slice(
        -CANDIDATE_CAP,
      );
    }
    console.log(`${market.id}: scoring ${candidates.length} recent users`);

    const scored = (
      await mapPool(candidates, async (user) => {
        try {
          const data = await contract.getUserAccountData(user);
          const collateralUsd = Number(data.totalCollateralValue) / 1e8;
          const debtUsd = Number(data.totalDebtValueRay) / 1e35;
          const hf = Number(ethers.utils.formatUnits(data.healthFactor, 18));
          if (collateralUsd <= 0) return null;
          return {
            marketId: market.id,
            address: user.toLowerCase(),
            collateralUsd,
            debtUsd,
            healthFactor: hf > 1e18 ? -1 : hf,
          } as SeedRow;
        } catch {
          return null;
        }
      })
    ).filter((row): row is SeedRow => !!row);

    const withDebt = scored
      .filter((row) => row.debtUsd > 0 && row.healthFactor > 1.01)
      .sort(
        (a, b) => b.collateralUsd + b.debtUsd - (a.collateralUsd + a.debtUsd),
      );
    const fallback = scored
      .filter((row) => row.collateralUsd > 0)
      .sort((a, b) => b.collateralUsd - a.collateralUsd);

    const picked: SeedRow[] = [];
    const used = new Set<string>();
    for (const row of [...withDebt, ...fallback]) {
      if (picked.length >= PER_MARKET) break;
      if (used.has(row.address)) continue;
      picked.push(row);
      used.add(row.address);
    }

    if (!picked.length) {
      console.log("  no usable positions");
      continue;
    }
    picked.forEach((row) => {
      seeds.push(row);
      console.log(
        `  ${row.address}  coll $${row.collateralUsd.toFixed(0)}  debt $${row.debtUsd.toFixed(0)}  HF ${row.healthFactor.toFixed(3)}`,
      );
    });
  }

  console.log("\nPaste-ready addresses:");
  console.log(JSON.stringify(seeds.map((s) => s.address), null, 2));
  console.log("\nSeed rows:");
  console.log(JSON.stringify(seeds, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
