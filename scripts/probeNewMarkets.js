/**
 * One-shot probe for candidate markets (Plasma, MegaETH):
 *  - is the UiPoolDataProvider a v3.7 deployment? (legacy decode throws)
 *  - which block was Aave deployed at? (binary search eth_getCode)
 * Usage: node scripts/probeNewMarkets.js
 */
const { ethers } = require("ethers");
const { UiPoolDataProvider, ChainId } = require("@aave/contract-helpers");
const { AaveV3Plasma, AaveV3MegaEth } = require("@aave-dao/aave-address-book");

const V37_ABI = [
  "function getReservesData(address provider) view returns (tuple(address underlyingAsset, string name, string symbol, uint256 decimals, uint256 baseLTVasCollateral, uint256 reserveLiquidationThreshold, uint256 reserveLiquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool isActive, bool isFrozen, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 liquidityRate, uint128 variableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint256 availableLiquidity, uint256 totalScaledVariableDebt, uint256 priceInMarketReferenceCurrency, address priceOracle, uint256 variableRateSlope1, uint256 variableRateSlope2, uint256 baseVariableBorrowRate, uint256 optimalUsageRatio, bool isPaused, bool isSiloedBorrowing, uint128 accruedToTreasury, uint128 isolationModeTotalDebt, bool flashLoanEnabled, uint256 debtCeiling, uint256 debtCeilingDecimals, uint256 borrowCap, uint256 supplyCap, bool borrowableInIsolation, uint128 virtualUnderlyingBalance, uint128 deficit)[] reserves, tuple(uint256 marketReferenceCurrencyUnit, int256 marketReferenceCurrencyPriceInUsd, int256 networkBaseTokenPriceInUsd, uint8 networkBaseTokenPriceDecimals) baseCurrency)",
];

async function findDeployBlock(provider, address, latest) {
  let lo = 0;
  let hi = latest;
  // getCode at `latest` should be non-empty; find first block where it is.
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

async function probe(name, url, book) {
  const provider = new ethers.providers.StaticJsonRpcProvider(url);
  const latest = await provider.getBlockNumber();
  console.log(`\n=== ${name} (chainId ${book.CHAIN_ID}) ===`);
  console.log(`latest block: ${latest.toLocaleString()}`);

  // Legacy decode (pinned contract-helpers). Throws on v3.7 deployments.
  let legacyOk = false;
  try {
    const legacy = new UiPoolDataProvider({
      uiPoolDataProviderAddress: book.UI_POOL_DATA_PROVIDER,
      provider,
      chainId: ChainId.mainnet, // only used for humanized ids
    });
    const res = await legacy.getReservesHumanized({
      lendingPoolAddressProvider: book.POOL_ADDRESSES_PROVIDER,
    });
    legacyOk = true;
    console.log(
      `legacy (pre-3.7) decode: OK, ${res.reservesData.length} reserves`,
    );
  } catch (e) {
    console.log(`legacy (pre-3.7) decode: FAILED (${e.code || e.message})`);
  }

  // v3.7 decode.
  try {
    const v37 = new ethers.Contract(
      book.UI_POOL_DATA_PROVIDER,
      V37_ABI,
      provider,
    );
    const [reserves] = await v37.getReservesData(book.POOL_ADDRESSES_PROVIDER);
    console.log(
      `v3.7 decode: OK, ${reserves.length} reserves (${reserves
        .slice(0, 5)
        .map((r) => r.symbol)
        .join(", ")}...)`,
    );
  } catch (e) {
    console.log(`v3.7 decode: FAILED (${e.code || e.message})`);
  }

  if (!legacyOk) {
    // No point finding the deploy block twice; POOL_ADDRESSES_PROVIDER is the
    // earliest-deployed piece the app scans events against.
  }
  try {
    const deployBlock = await findDeployBlock(
      provider,
      book.POOL_ADDRESSES_PROVIDER,
      latest,
    );
    console.log(
      `POOL_ADDRESSES_PROVIDER deployed at block: ${deployBlock.toLocaleString()}`,
    );
  } catch (e) {
    console.log(
      `deploy-block search failed (archive access?): ${e.code || e.message}`,
    );
  }
}

(async () => {
  // Public endpoints: rate-limited but keyless, fine for a one-shot probe.
  await probe("Plasma", "https://rpc.plasma.to", AaveV3Plasma);
  await probe("MegaETH", "https://mainnet.megaeth.com/rpc", AaveV3MegaEth);
})();
