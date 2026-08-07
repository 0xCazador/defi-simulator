/**
 * Live verification of token-event accrual math against an independent
 * liquidity-index calculation.
 *
 * Finds positions opened within the last ~9.5k blocks (Mint with
 * balanceIncrease == 0 implies the position started from zero), confirms the user
 * has had no further index-touching events (getPreviousIndex still equals the mint
 * index and scaledBalanceOf matches the minted scaled amount), then compares:
 *
 *   eventMath:  accrued = balanceOf(now) - principal        (our approach)
 *   indexMath:  accrued = value * (indexNow / indexAtMint - 1)   (ground truth)
 *
 * Usage: node scripts/verifyAccrualMath.js <rpcUrl> <aTokenAddress> <underlyingAddress>
 * Read-only.
 */
const { ethers } = require('ethers');

const RPC = process.argv[2];
const ATOKEN = process.argv[3];
const UNDERLYING = process.argv[4];
const POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'; // Aave v3 Ethereum Pool

const RAY = ethers.BigNumber.from(10).pow(27);

const ABI = [
  'event Mint(address indexed caller, address indexed onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)',
  'function balanceOf(address) view returns (uint256)',
  'function scaledBalanceOf(address) view returns (uint256)',
  'function getPreviousIndex(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];
const POOL_ABI = [
  'function getReserveNormalizedIncome(address) view returns (uint256)',
  'function getReserveNormalizedVariableDebt(address) view returns (uint256)',
];
const SIDE = process.argv[5] || 'supply';

const rayDiv = (a, b) => a.mul(RAY).add(b.div(2)).div(b);

(async () => {
  const provider = new ethers.providers.StaticJsonRpcProvider(RPC, 1);
  const token = new ethers.Contract(ATOKEN, ABI, provider);
  const pool = new ethers.Contract(POOL, POOL_ABI, provider);
  const iface = token.interface;

  const latest = await provider.getBlockNumber();
  const logs = await provider.getLogs({
    address: ATOKEN,
    fromBlock: latest - 9500,
    toBlock: latest,
    topics: [iface.getEventTopic('Mint')],
  });

  const symbol = await token.symbol();
  const decimals = await token.decimals();
  console.log(`${symbol}: ${logs.length} Mint events in last 9500 blocks`);

  // position-opening mints only (balanceIncrease == 0 means prior scaled balance was 0)
  const candidates = logs
    .map((log) => ({ log, args: iface.parseLog(log).args }))
    .filter(({ args }) => args.balanceIncrease.isZero() && args.value.gt(0));

  let verified = 0;
  for (const { log, args } of candidates) {
    if (verified >= 3) break;
    const user = args.onBehalfOf;

    const [scaledNow, prevIndex, balanceNow, indexNow] = await Promise.all([
      token.scaledBalanceOf(user),
      token.getPreviousIndex(user),
      token.balanceOf(user),
      SIDE === 'supply'
        ? pool.getReserveNormalizedIncome(UNDERLYING)
        : pool.getReserveNormalizedVariableDebt(UNDERLYING),
    ]);

    // skip users with any later activity (their event history extends past our window)
    const mintedScaled = rayDiv(args.value, args.index);
    if (!prevIndex.eq(args.index) || !scaledNow.eq(mintedScaled)) continue;

    // our event math: principal = value - balanceIncrease (= value here)
    const eventMathAccrued = balanceNow.sub(args.value);
    // independent index math
    const indexMathAccrued = args.value.mul(indexNow.sub(args.index)).div(args.index);

    const diff = eventMathAccrued.sub(indexMathAccrued).abs();
    const ok = diff.lte(2); // allow a couple wei of rounding
    verified += 1;
    console.log(
      `user ${user.slice(0, 10)}… supplied ${ethers.utils.formatUnits(args.value, decimals)} at block ${log.blockNumber}\n` +
      `  eventMath accrued: ${ethers.utils.formatUnits(eventMathAccrued, decimals)}\n` +
      `  indexMath accrued: ${ethers.utils.formatUnits(indexMathAccrued, decimals)}\n` +
      `  diff (base units): ${diff.toString()}  ${ok ? 'MATCH' : 'MISMATCH'}`
    );
  }
  if (verified === 0) console.log('No clean single-event positions found in window.');
})().catch((e) => { console.error('ERR:', (e.message || String(e)).slice(0, 300)); process.exit(1); });
