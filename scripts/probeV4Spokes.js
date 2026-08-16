/**
 * One-shot probe for the Aave v4 Ethereum deployment (Hub & Spoke):
 *  - do the candidate Spoke addresses respond to the ISpoke view ABI?
 *  - does each Spoke's ORACLE() match the expected per-Spoke oracle?
 *  - which Hub does each reserve draw from, and what assets are listed?
 *  - which block were the Spokes deployed at? (binary search eth_getCode)
 * Usage: node scripts/probeV4Spokes.js
 */
const { ethers } = require("ethers");

const SPOKE_ABI = [
  "function ORACLE() view returns (address)",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 reserveId) view returns (tuple(address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))",
  "function getReserveConfig(uint256 reserveId) view returns (tuple(uint24 collateralRisk, bool paused, bool frozen, bool borrowable, bool receiveSharesEnabled))",
  "function getDynamicReserveConfig(uint256 reserveId, uint32 dynamicConfigKey) view returns (tuple(uint16 collateralFactor, uint32 maxLiquidationBonus, uint16 liquidationFee))",
];

const ORACLE_ABI = [
  "function getReservesPrices(uint256[] reserveIds) view returns (uint256[])",
];

const HUB_ABI = [
  "function getAssetCount() view returns (uint256)",
  "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
];

const ERC20_ABI = ["function symbol() view returns (string)"];

// Candidate addresses from the Aave v4 Ethereum activation proposal.
const HUBS = {
  Core: "0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9",
  Plus: "0x06002e9c4412CB7814a791eA3666D905871E536A",
  Prime: "0x943827DCA022D0F354a8a8c332dA1e5Eb9f9F931",
};

const SPOKES = [
  {
    name: "Main",
    spoke: "0x94e7A5dCbE816e498b89aB752661904E2F56c485",
    oracle: "0x99B2B6CEa9C3D2fd8F4d90f86741C44B212a6127",
  },
  {
    name: "Lido",
    spoke: "0xe1900480ac69f0B296841Cd01cC37546d92F35Cd",
    oracle: "0x664D73b6C3591333Fd79510f7ce9ef81228824F5",
  },
  {
    name: "EtherFi",
    spoke: "0xbF10BDfE177dE0336aFD7fcCF80A904E15386219",
    oracle: "0xd8B153FaAA8f2b1bC774916FEd333A4F3dE48792",
  },
  {
    name: "Kelp",
    spoke: "0x3131FE68C4722e726fe6B2819ED68e514395B9a4",
    oracle: "0x37C316996C714Bf906743071e04E62220b3271ac",
  },
  {
    name: "Lombard BTC",
    spoke: "0x7EC68b5695e803e98a21a9A05d744F28b0a7753D",
    oracle: "0x198Cac7f54FFc7d709Ac0FEc4B6454CE73e21D3D",
  },
  {
    name: "Gold",
    spoke: "0x65407b940966954b23dfA3caA5C0702bB42984DC",
    oracle: "0x0083421fd178749af2201ddA5A7C3feB5790B80c",
  },
  {
    name: "Forex",
    spoke: "0xD8B93635b8C6d0fF98CbE90b5988E3F2d1Cd9da1",
    oracle: "0xB3CE6E7b6d389a66eA4a3777bA07219d00FB3a9D",
  },
  {
    name: "Bluechip",
    spoke: "0x973a023A77420ba610f06b3858aD991Df6d85A08",
    oracle: "0xdA1266a7b8620819dAE3F8bd6B546Da36e505bB8",
  },
  {
    name: "Ethena Ecosystem",
    spoke: "0xba1B3D55D249692b669A164024A838309B7508AF",
    oracle: "0xc390dbe9fc00D6db73C52d375642b47008C33c90",
  },
  {
    name: "Ethena Correlated",
    spoke: "0x58131E79531caB1d52301228d1f7b842F26B9649",
    oracle: null, // unknown; report what ORACLE() returns
  },
];

const hubName = (address) =>
  Object.entries(HUBS).find(
    ([, a]) => a.toLowerCase() === address.toLowerCase(),
  )?.[0] ?? address;

async function findDeployBlock(provider, address, latest) {
  let lo = 0;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    if (code && code !== "0x") {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

async function probeSpoke(provider, { name, spoke, oracle }) {
  console.log(`\n=== ${name} Spoke (${spoke}) ===`);
  const contract = new ethers.Contract(spoke, SPOKE_ABI, provider);
  const [oracleOnChain, reserveCount] = await Promise.all([
    contract.ORACLE(),
    contract.getReserveCount(),
  ]);
  const oracleMatch = oracle
    ? oracleOnChain.toLowerCase() === oracle.toLowerCase()
      ? "matches expected"
      : `MISMATCH (expected ${oracle})`
    : "no expectation";
  console.log(`ORACLE(): ${oracleOnChain} (${oracleMatch})`);
  console.log(`reserveCount: ${reserveCount.toNumber()}`);

  const ids = Array.from({ length: reserveCount.toNumber() }, (_, i) => i);
  const reserves = await Promise.all(ids.map((id) => contract.getReserve(id)));
  const dynConfigs = await Promise.all(
    ids.map((id, i) =>
      contract.getDynamicReserveConfig(id, reserves[i].dynamicConfigKey),
    ),
  );
  const symbols = await Promise.all(
    reserves.map((r) =>
      new ethers.Contract(r.underlying, ERC20_ABI, provider)
        .symbol()
        .catch(() => "???"),
    ),
  );
  let prices = [];
  try {
    prices = await new ethers.Contract(
      oracleOnChain,
      ORACLE_ABI,
      provider,
    ).getReservesPrices(ids);
  } catch (e) {
    console.log(`getReservesPrices FAILED: ${e.code || e.message}`);
  }
  ids.forEach((id) => {
    const price = prices[id]
      ? (Number(prices[id]) / 1e8).toLocaleString()
      : "?";
    console.log(
      `  #${id} ${symbols[id]} hub=${hubName(reserves[id].hub)} assetId=${
        reserves[id].assetId
      } CF=${dynConfigs[id].collateralFactor}bps price=$${price}`,
    );
  });
}

(async () => {
  // Keyless public endpoint: rate-limited but fine for a one-shot probe.
  const provider = new ethers.providers.StaticJsonRpcProvider(
    "https://ethereum-rpc.publicnode.com",
  );
  const latest = await provider.getBlockNumber();
  console.log(`latest block: ${latest.toLocaleString()}`);

  for (const [name, address] of Object.entries(HUBS)) {
    const hub = new ethers.Contract(address, HUB_ABI, provider);
    try {
      const count = await hub.getAssetCount();
      const rate = count.gt(0) ? await hub.getAssetDrawnRate(0) : null;
      console.log(
        `${name} Hub: ${count} assets${
          rate ? `, asset 0 drawn rate ${(Number(rate) / 1e25).toFixed(2)}%` : ""
        }`,
      );
    } catch (e) {
      console.log(`${name} Hub FAILED: ${e.code || e.message}`);
    }
  }

  for (const spoke of SPOKES) {
    try {
      await probeSpoke(provider, spoke);
    } catch (e) {
      console.log(`\n=== ${spoke.name} Spoke FAILED: ${e.code || e.message}`);
    }
  }

  const deployBlock = await findDeployBlock(
    provider,
    SPOKES[0].spoke,
    latest,
  );
  console.log(
    `\nMain Spoke deployed at block: ${deployBlock.toLocaleString()}`,
  );
})();
