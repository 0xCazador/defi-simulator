import { ethers } from "ethers";
import type {
  PoolBaseCurrencyHumanized,
  ReserveDataHumanized,
  UserReserveDataHumanized,
} from "@aave/contract-helpers";

/**
 * Aave v3.7 reshaped the UiPoolDataProvider return structs: stable-rate
 * borrowing and the per-reserve eMode fields are gone, `deficit` was added, and
 * the user struct is down to four fields. The pinned @aave/contract-helpers
 * still decodes the pre-3.7 layout, so its UiPoolDataProvider throws a
 * CALL_EXCEPTION against a v3.7 deployment even though the call itself succeeds.
 *
 * These helpers decode the v3.7 layout directly and return the same humanized
 * shapes the rest of the pipeline (formatReserves / formatUserSummary) expects,
 * so only the decode step differs for a v3.7 market. Fields v3.7 no longer
 * reports are filled with inert values: stable borrowing is fully deprecated,
 * and real eMode configuration is read from the Pool in ./liquidEMode.
 */

const UI_POOL_DATA_PROVIDER_V37_ABI = [
  "function getReservesData(address provider) view returns (tuple(address underlyingAsset, string name, string symbol, uint256 decimals, uint256 baseLTVasCollateral, uint256 reserveLiquidationThreshold, uint256 reserveLiquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool isActive, bool isFrozen, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 liquidityRate, uint128 variableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint256 availableLiquidity, uint256 totalScaledVariableDebt, uint256 priceInMarketReferenceCurrency, address priceOracle, uint256 variableRateSlope1, uint256 variableRateSlope2, uint256 baseVariableBorrowRate, uint256 optimalUsageRatio, bool isPaused, bool isSiloedBorrowing, uint128 accruedToTreasury, uint128 isolationModeTotalDebt, bool flashLoanEnabled, uint256 debtCeiling, uint256 debtCeilingDecimals, uint256 borrowCap, uint256 supplyCap, bool borrowableInIsolation, uint128 virtualUnderlyingBalance, uint128 deficit)[] reserves, tuple(uint256 marketReferenceCurrencyUnit, int256 marketReferenceCurrencyPriceInUsd, int256 networkBaseTokenPriceInUsd, uint8 networkBaseTokenPriceDecimals) baseCurrency)",
  "function getUserReservesData(address provider, address user) view returns (tuple(address underlyingAsset, uint256 scaledATokenBalance, bool usageAsCollateralEnabledOnUser, uint256 scaledVariableDebt)[] userReserves, uint8 userEmodeCategoryId)",
];

const { AddressZero } = ethers.constants;

const contractFor = (
  provider: ethers.providers.Provider,
  uiPoolDataProviderAddress: string
) =>
  new ethers.Contract(
    uiPoolDataProviderAddress,
    UI_POOL_DATA_PROVIDER_V37_ABI,
    provider
  );

export type V37Context = {
  provider: ethers.providers.Provider;
  uiPoolDataProviderAddress: string;
  lendingPoolAddressProvider: string;
  chainId: number;
};

/** v3.7 equivalent of UiPoolDataProvider.getReservesHumanized. */
export const getReservesHumanizedV37 = async ({
  provider,
  uiPoolDataProviderAddress,
  lendingPoolAddressProvider,
  chainId,
}: V37Context): Promise<{
  reservesData: ReserveDataHumanized[];
  baseCurrencyData: PoolBaseCurrencyHumanized;
}> => {
  const [reservesRaw, baseRaw] = await contractFor(
    provider,
    uiPoolDataProviderAddress
  ).getReservesData(lendingPoolAddressProvider);

  const reservesData: ReserveDataHumanized[] = reservesRaw.map((r: any) => ({
    id: `${chainId}-${r.underlyingAsset}-${lendingPoolAddressProvider}`.toLowerCase(),
    underlyingAsset: r.underlyingAsset.toLowerCase(),
    name: r.name,
    symbol: r.symbol,
    decimals: r.decimals.toNumber(),
    baseLTVasCollateral: r.baseLTVasCollateral.toString(),
    reserveLiquidationThreshold: r.reserveLiquidationThreshold.toString(),
    reserveLiquidationBonus: r.reserveLiquidationBonus.toString(),
    reserveFactor: r.reserveFactor.toString(),
    usageAsCollateralEnabled: r.usageAsCollateralEnabled,
    borrowingEnabled: r.borrowingEnabled,
    isActive: r.isActive,
    isFrozen: r.isFrozen,
    liquidityIndex: r.liquidityIndex.toString(),
    variableBorrowIndex: r.variableBorrowIndex.toString(),
    liquidityRate: r.liquidityRate.toString(),
    variableBorrowRate: r.variableBorrowRate.toString(),
    lastUpdateTimestamp: r.lastUpdateTimestamp,
    aTokenAddress: r.aTokenAddress,
    variableDebtTokenAddress: r.variableDebtTokenAddress,
    interestRateStrategyAddress: r.interestRateStrategyAddress,
    availableLiquidity: r.availableLiquidity.toString(),
    totalScaledVariableDebt: r.totalScaledVariableDebt.toString(),
    priceInMarketReferenceCurrency: r.priceInMarketReferenceCurrency.toString(),
    priceOracle: r.priceOracle,
    variableRateSlope1: r.variableRateSlope1.toString(),
    variableRateSlope2: r.variableRateSlope2.toString(),
    baseVariableBorrowRate: r.baseVariableBorrowRate.toString(),
    optimalUsageRatio: r.optimalUsageRatio.toString(),
    isPaused: r.isPaused,
    isSiloedBorrowing: r.isSiloedBorrowing,
    accruedToTreasury: r.accruedToTreasury.toString(),
    isolationModeTotalDebt: r.isolationModeTotalDebt.toString(),
    flashLoanEnabled: r.flashLoanEnabled,
    debtCeiling: r.debtCeiling.toString(),
    debtCeilingDecimals: r.debtCeilingDecimals.toNumber(),
    borrowCap: r.borrowCap.toString(),
    supplyCap: r.supplyCap.toString(),
    borrowableInIsolation: r.borrowableInIsolation,
    virtualAccActive: true,
    virtualUnderlyingBalance: r.virtualUnderlyingBalance.toString(),

    // Dropped by v3.7. Stable borrowing no longer exists, and per-reserve eMode
    // values were replaced by the Pool's liquid eMode categories.
    stableBorrowRateEnabled: false,
    stableBorrowRate: "0",
    stableDebtTokenAddress: AddressZero,
    totalPrincipalStableDebt: "0",
    averageStableRate: "0",
    stableDebtLastUpdateTimestamp: 0,
    stableRateSlope1: "0",
    stableRateSlope2: "0",
    baseStableBorrowRate: "0",
    eModeCategoryId: 0,
    eModeLtv: 0,
    eModeLiquidationThreshold: 0,
    eModeLiquidationBonus: 0,
    eModePriceSource: AddressZero,
    eModeLabel: "",
    unbacked: "0",
  }));

  return {
    reservesData,
    baseCurrencyData: {
      // The unit is a power of ten, so its digit count gives the decimals.
      marketReferenceCurrencyDecimals:
        baseRaw.marketReferenceCurrencyUnit.toString().length - 1,
      marketReferenceCurrencyPriceInUsd:
        baseRaw.marketReferenceCurrencyPriceInUsd.toString(),
      networkBaseTokenPriceInUsd: baseRaw.networkBaseTokenPriceInUsd.toString(),
      networkBaseTokenPriceDecimals: baseRaw.networkBaseTokenPriceDecimals,
    },
  };
};

/** v3.7 equivalent of UiPoolDataProvider.getUserReservesHumanized. */
export const getUserReservesHumanizedV37 = async (
  {
    provider,
    uiPoolDataProviderAddress,
    lendingPoolAddressProvider,
    chainId,
  }: V37Context,
  user: string
): Promise<{
  userReserves: UserReserveDataHumanized[];
  userEmodeCategoryId: number;
}> => {
  const [userReservesRaw, userEmodeCategoryId] = await contractFor(
    provider,
    uiPoolDataProviderAddress
  ).getUserReservesData(lendingPoolAddressProvider, user);

  return {
    userReserves: userReservesRaw.map((u: any) => ({
      id: `${chainId}-${user}-${u.underlyingAsset}-${lendingPoolAddressProvider}`.toLowerCase(),
      underlyingAsset: u.underlyingAsset.toLowerCase(),
      scaledATokenBalance: u.scaledATokenBalance.toString(),
      usageAsCollateralEnabledOnUser: u.usageAsCollateralEnabledOnUser,
      scaledVariableDebt: u.scaledVariableDebt.toString(),
      stableBorrowRate: "0",
      principalStableDebt: "0",
      stableBorrowLastUpdateTimestamp: 0,
    })),
    userEmodeCategoryId,
  };
};
