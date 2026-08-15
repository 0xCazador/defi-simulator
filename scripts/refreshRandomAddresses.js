/**
 * Refresh the "random address" CDP list used by the home page.
 *
 * Pipeline:
 *  1. Collect candidate participants per market, either from Blockscout's token
 *     holders index or, on chains Blockscout does not cover, from the Aave
 *     tokens' own Mint events.
 *  2. Seed with a few known-good demo addresses.
 *  3. Score every candidate via api.v3.aave.com userMarketState across markets.
 *  4. Keep active CDPs (collateral AND debt) ranked by total position size,
 *     with light diversification across chains.
 *
 * Usage: node scripts/refreshRandomAddresses.js
 * Read-only. Writes scripts/randomAddresses.generated.json and prints a paste-ready array.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {
  AaveV3Ethereum,
  AaveV3Arbitrum,
  AaveV3Optimism,
  AaveV3Base,
  AaveV3Polygon,
  AaveV3Avalanche,
  AaveV3BNB,
  AaveV3Monad,
  AaveV3Plasma,
  AaveV3MegaEth,
} = require("@aave-dao/aave-address-book");

/** Read the Alchemy key from the environment, falling back to .env.local so the
 * script works the same way `next dev` does. */
function alchemyKey() {
  if (process.env.NEXT_PUBLIC_ALCHEMY_API_KEY) {
    return process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  }
  try {
    const envFile = fs.readFileSync(
      path.join(__dirname, "..", ".env.local"),
      "utf8"
    );
    const match = envFile.match(/NEXT_PUBLIC_ALCHEMY_API_KEY=(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const MARKETS = [
  {
    id: "ETHEREUM_V3",
    chainId: 1,
    pool: AaveV3Ethereum.POOL,
    blockscout: "https://eth.blockscout.com/api",
    book: AaveV3Ethereum,
    // Prioritize assets that dominate TVL / borrowing
    assets: ["WETH", "wstETH", "weETH", "WBTC", "cbBTC", "USDC", "USDT", "USDe", "GHO", "USDS"],
  },
  {
    id: "ARBITRUM_V3",
    chainId: 42161,
    pool: AaveV3Arbitrum.POOL,
    blockscout: "https://arbitrum.blockscout.com/api",
    book: AaveV3Arbitrum,
    assets: ["WETH", "wstETH", "weETH", "WBTC", "USDC", "USDT", "USDCn", "GHO"],
  },
  {
    id: "BASE_V3",
    chainId: 8453,
    pool: AaveV3Base.POOL,
    blockscout: "https://base.blockscout.com/api",
    book: AaveV3Base,
    assets: ["WETH", "wstETH", "weETH", "cbETH", "cbBTC", "USDC"],
  },
  {
    id: "OPTIMISM_V3",
    chainId: 10,
    pool: AaveV3Optimism.POOL,
    blockscout: "https://optimism.blockscout.com/api",
    book: AaveV3Optimism,
    assets: ["WETH", "wstETH", "WBTC", "USDC", "USDT", "USDCn", "DAI"],
  },
  {
    id: "POLYGON_V3",
    chainId: 137,
    pool: AaveV3Polygon.POOL,
    blockscout: "https://polygon.blockscout.com/api",
    book: AaveV3Polygon,
    assets: ["WETH", "wstETH", "WBTC", "USDC", "USDT", "USDCn", "DAI"],
  },
  // Scored but not harvested. The home page auto-selects whichever market holds
  // an address's largest position, so every market the app supports has to be
  // scored or an address gets labelled with a market it will not open on.
  {
    id: "AVALANCHE_V3",
    chainId: 43114,
    pool: AaveV3Avalanche.POOL,
    book: AaveV3Avalanche,
  },
  {
    id: "BNB_V3",
    chainId: 56,
    pool: AaveV3BNB.POOL,
    book: AaveV3BNB,
  },
  {
    id: "MONAD_V3",
    chainId: 143,
    pool: AaveV3Monad.POOL,
    book: AaveV3Monad,
    // Blockscout has no Monad instance, so candidates come from Mint events on
    // the Aave tokens themselves. Aave launched here at ~block 85,000,000, so
    // there is nothing to find before that.
    logHarvest: { rpcHost: "monad-mainnet.g.alchemy.com", startBlock: 85_000_000 },
    assets: ["USDC", "USDT0", "WETH", "cbBTC", "syrupUSDC", "sUSDe", "wstETH", "GHO"],
  },
  {
    id: "PLASMA_V3",
    chainId: 9745,
    pool: AaveV3Plasma.POOL,
    book: AaveV3Plasma,
  },
  {
    id: "MEGAETH_V3",
    chainId: 4326,
    pool: AaveV3MegaEth.POOL,
    book: AaveV3MegaEth,
  },
];

/** Mint(address caller, address onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)
 * — emitted by both aTokens and variable debt tokens, with onBehalfOf indexed
 * as the position owner. */
const MINT_TOPIC = ethers.utils.id(
  "Mint(address,address,uint256,uint256,uint256)"
);

const KNOWN_GOOD = [
  "0x3ee301d27fd556eca7aaa8c50cdbd461577c42a6",
  "0x0591926d5d3b9cc48ae6efb8db68025ddc3adfa5",
  "0x65c4c0517025ec0843c9146af266a2c5a2d148a2",
  // Largest Monad position; its last mint is old enough to fall outside the
  // per-token recency window, so seed it rather than rely on the harvest.
  "0x3145cb0695416effe6ec9585e706f47b6c3c6599",
];

const HOLDERS_PER_TOKEN = 40;
const MIN_COLLATERAL_USD = 200_000;
const MIN_DEBT_USD = 40_000;
const TARGET_COUNT = 70;
const CONCURRENCY = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, opts) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, opts);
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`rate limited: ${url}`);
}

function tokenAddresses(market, symbol) {
  const entry = market.book.ASSETS?.[symbol];
  if (!entry) return null;
  return {
    aToken: entry.A_TOKEN,
    vToken: entry.V_TOKEN,
  };
}

async function getTopHolders(blockscout, token) {
  const d = await fetchJson(
    `${blockscout}?module=token&action=getTokenHolders&contractaddress=${token}&page=1&offset=${HOLDERS_PER_TOKEN}`
  );
  if (!Array.isArray(d.result)) return [];
  return d.result
    .map((r) => (r.address || "").toLowerCase())
    .filter((a) => /^0x[a-f0-9]{40}$/.test(a));
}

/** Addresses that most recently received a mint of this token. Logs arrive in
 * ascending block order, so walking from the end favours positions that are
 * still open, and caps the candidate count the same way the Blockscout path
 * does with its top-N holders. */
async function getMintRecipients(rpcUrl, token, fromBlock) {
  const d = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [
        {
          address: token,
          topics: [MINT_TOPIC],
          fromBlock: ethers.utils.hexValue(fromBlock),
          toBlock: "latest",
        },
      ],
    }),
  });
  if (d.error) throw new Error(d.error.message || "eth_getLogs failed");

  const logs = d.result || [];
  const recent = new Set();
  for (let i = logs.length - 1; i >= 0 && recent.size < HOLDERS_PER_TOKEN; i--) {
    const owner = `0x${logs[i].topics[2].slice(26)}`.toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(owner)) recent.add(owner);
  }
  return [...recent];
}

async function harvestMarket(market) {
  const users = new Set();
  let tokensQueried = 0;

  if (!market.blockscout && !market.logHarvest) return users;

  let rpcUrl = null;
  if (market.logHarvest) {
    const key = alchemyKey();
    if (!key) {
      console.warn(
        `  ${market.id}: skipped — NEXT_PUBLIC_ALCHEMY_API_KEY is required to read logs`
      );
      return users;
    }
    rpcUrl = `https://${market.logHarvest.rpcHost}/v2/${key}`;
  }

  for (const symbol of market.assets) {
    const toks = tokenAddresses(market, symbol);
    if (!toks) continue;
    for (const [kind, addr] of [
      ["a", toks.aToken],
      ["v", toks.vToken],
    ]) {
      if (!addr) continue;
      try {
        await sleep(150);
        const found = market.logHarvest
          ? await getMintRecipients(
              rpcUrl,
              addr,
              market.logHarvest.startBlock
            )
          : await getTopHolders(market.blockscout, addr);
        found.forEach((h) => users.add(h));
        tokensQueried += 1;
      } catch (e) {
        console.warn(
          `    ${market.id} ${symbol} ${kind}Token holders failed:`,
          (e.message || String(e)).slice(0, 100)
        );
      }
    }
  }
  console.log(`  ${market.id}: ${users.size} unique holders from ${tokensQueried} tokens`);
  return users;
}

async function scoreUser(address) {
  const results = [];
  for (const market of MARKETS) {
    try {
      const body = {
        query: `query($m: EvmAddress!, $c: ChainId!, $u: EvmAddress!) {
          userMarketState(request: { market: $m, chainId: $c, user: $u }) {
            healthFactor
            netWorth
            totalCollateralBase
            totalDebtBase
          }
        }`,
        variables: { m: market.pool, c: market.chainId, u: address },
      };
      const d = await fetchJson("https://api.v3.aave.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const s = d?.data?.userMarketState;
      if (!s) continue;
      const collateral = Number(s.totalCollateralBase);
      const debt = Number(s.totalDebtBase);
      const hf = s.healthFactor == null ? null : Number(s.healthFactor);
      if (!Number.isFinite(collateral) || collateral <= 0) continue;
      results.push({
        marketId: market.id,
        collateral,
        debt,
        netWorth: Number(s.netWorth),
        healthFactor: hf,
      });
    } catch {
      // ignore per-market failures
    }
  }
  if (!results.length) return null;
  results.sort((a, b) => b.collateral + b.debt - (a.collateral + a.debt));
  return { address, ...results[0], marketsActive: results.length };
}

async function mapPool(items, concurrency, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

(async () => {
  console.log("1) Harvesting current top aToken / vToken holders…");
  const candidates = new Set(KNOWN_GOOD.map((a) => a.toLowerCase()));
  for (const market of MARKETS) {
    try {
      const users = await harvestMarket(market);
      for (const u of users) candidates.add(u);
    } catch (e) {
      console.warn(`  ${market.id} harvest failed:`, (e.message || String(e)).slice(0, 160));
    }
  }
  const list = [...candidates];
  console.log(`   total unique candidates: ${list.length}`);

  console.log("2) Scoring via Aave GraphQL userMarketState…");
  let done = 0;
  const scored = (
    await mapPool(list, CONCURRENCY, async (address) => {
      const row = await scoreUser(address);
      done += 1;
      if (done % 25 === 0 || done === list.length) {
        process.stdout.write(`   scored ${done}/${list.length}\r`);
      }
      return row;
    })
  ).filter(Boolean);
  console.log(`\n   scored with any position: ${scored.length}`);

  const cdps = scored
    .filter(
      (r) =>
        r.collateral >= MIN_COLLATERAL_USD &&
        r.debt >= MIN_DEBT_USD &&
        r.healthFactor != null &&
        Number.isFinite(r.healthFactor) &&
        r.healthFactor > 1.01
    )
    .sort((a, b) => b.collateral + b.debt - (a.collateral + a.debt));

  console.log(
    `3) Active CDPs with collateral≥$${MIN_COLLATERAL_USD.toLocaleString()} and debt≥$${MIN_DEBT_USD.toLocaleString()}: ${cdps.length}`
  );

  // Diversify across markets, then fill remaining by size.
  const picked = [];
  const used = new Set();
  const quotas = {
    ARBITRUM_V3: 10,
    BASE_V3: 10,
    OPTIMISM_V3: 8,
    POLYGON_V3: 8,
    MONAD_V3: 8,
  };
  for (const [marketId, n] of Object.entries(quotas)) {
    let added = 0;
    for (const row of cdps) {
      if (added >= n || picked.length >= TARGET_COUNT) break;
      if (used.has(row.address) || row.marketId !== marketId) continue;
      picked.push(row);
      used.add(row.address);
      added += 1;
    }
  }
  for (const row of cdps) {
    if (picked.length >= TARGET_COUNT) break;
    if (used.has(row.address)) continue;
    picked.push(row);
    used.add(row.address);
  }

  // If still short of TARGET_COUNT, relax to high-collateral positions that still
  // have some debt (covers e.g. lightly borrowed whales).
  if (picked.length < TARGET_COUNT) {
    const relaxed = scored
      .filter(
        (r) =>
          !used.has(r.address) &&
          r.collateral >= MIN_COLLATERAL_USD &&
          r.debt >= 10_000 &&
          r.healthFactor != null &&
          Number.isFinite(r.healthFactor) &&
          r.healthFactor > 1.01
      )
      .sort((a, b) => b.collateral + b.debt - (a.collateral + a.debt));
    for (const row of relaxed) {
      if (picked.length >= TARGET_COUNT) break;
      picked.push(row);
      used.add(row.address);
    }
  }

  const summary = picked.map((r) => ({
    address: r.address,
    marketId: r.marketId,
    collateralUsd: Math.round(r.collateral),
    debtUsd: Math.round(r.debt),
    netWorthUsd: Math.round(r.netWorth),
    healthFactor: Number(r.healthFactor.toFixed(3)),
  }));

  const outPath = path.join(__dirname, "randomAddresses.generated.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  const marketCounts = summary.reduce((acc, r) => {
    acc[r.marketId] = (acc[r.marketId] || 0) + 1;
    return acc;
  }, {});
  console.log("\nMarket mix:", marketCounts);
  console.log(
    `Size range: $${(Math.min(...summary.map((r) => r.collateralUsd)) / 1e6).toFixed(2)}M` +
      ` – $${(Math.max(...summary.map((r) => r.collateralUsd)) / 1e6).toFixed(2)}M collateral`
  );

  console.log("\nTop 15 by position size:");
  [...summary]
    .sort((a, b) => b.collateralUsd + b.debtUsd - (a.collateralUsd + a.debtUsd))
    .slice(0, 15)
    .forEach((r, i) => {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${r.address}  ${r.marketId.padEnd(12)} ` +
          `coll $${(r.collateralUsd / 1e6).toFixed(2)}M  debt $${(r.debtUsd / 1e6).toFixed(2)}M  HF ${r.healthFactor}`
      );
    });

  console.log(`\nWrote ${summary.length} addresses → ${outPath}`);
  console.log("\nPaste-ready array:\n");
  console.log(
    "const addresses = [\n" +
      summary.map((r) => `    "${r.address}",`).join("\n") +
      "\n  ];"
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
