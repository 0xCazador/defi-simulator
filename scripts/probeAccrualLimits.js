/**
 * Probe Alchemy eth_getLogs behavior on Plasma/MegaETH the way the browser
 * accrual path calls it: full market range, then descending window sizes.
 * Sends an Origin header so the Alchemy app's origin allowlist is satisfied.
 * Usage: node scripts/probeAccrualLimits.js
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { AaveV3Plasma, AaveV3MegaEth } = require("@aave-dao/aave-address-book");

function alchemyKey() {
  const envFile = fs.readFileSync(
    path.join(__dirname, "..", ".env.local"),
    "utf8",
  );
  return envFile.match(/NEXT_PUBLIC_ALCHEMY_API_KEY=(\S+)/)[1];
}

const MINT_TOPIC = ethers.utils.id(
  "Mint(address,address,uint256,uint256,uint256)",
);

async function probe(name, host, aToken, startBlock) {
  const provider = new ethers.providers.StaticJsonRpcProvider({
    url: `https://${host}.g.alchemy.com/v2/${alchemyKey()}`,
    headers: { Origin: "http://localhost:8080" },
  });
  const latest = await provider.getBlockNumber();
  console.log(`\n=== ${name} (latest ${latest.toLocaleString()}) ===`);

  const ranges = [
    [startBlock, latest, "full market range"],
    [latest - 999_999, latest, "1M window"],
    [latest - 99_999, latest, "100k window"],
    [latest - 9_999, latest, "10k window"],
  ];
  for (const [from, to, label] of ranges) {
    try {
      const logs = await provider.getLogs({
        address: aToken,
        topics: [MINT_TOPIC],
        fromBlock: from,
        toBlock: to,
      });
      console.log(
        `${label} (${(to - from + 1).toLocaleString()} blocks): OK, ${logs.length} logs`,
      );
    } catch (e) {
      const msg = e?.error?.message || e?.body || e?.message || String(e);
      console.log(`${label}: FAILED -> ${String(msg).slice(0, 220)}`);
    }
  }
}

(async () => {
  await probe(
    "Plasma",
    "plasma-mainnet",
    AaveV3Plasma.ASSETS.USDT0.A_TOKEN,
    489_000,
  );
  await probe(
    "MegaETH",
    "megaeth-mainnet",
    AaveV3MegaEth.ASSETS.WETH.A_TOKEN,
    6_650_000,
  );
})();
