import { i18n as globalI18n } from "@lingui/core";

import { useLingui } from "@lingui/react";
import { useFiatRates } from "../hooks/useFiatData";

type LocalizedFiatDisplayProps = {
  valueUSD: number;
  includeCurrencyCode?: boolean;
  /** Round to whole units, for summary figures where cents add noise */
  hideFractionDigits?: boolean;
};

export const getLocalizedFiatString = (
  valueUSD: number,
  currentRate: number,
  selectedCurrency: string
) => {
  const value = currentRate * valueUSD;
  return globalI18n.number(value, {
    style: "currency",
    currency: selectedCurrency,
  });
};

export default function LocalizedFiatDisplay({
  valueUSD,
  includeCurrencyCode = false,
  hideFractionDigits = false,
}: LocalizedFiatDisplayProps) {
  const { i18n } = useLingui();
  const { selectedCurrency, currentRate } = useFiatRates(false);

  const convertedValue = currentRate * valueUSD;

  let currencyString = i18n.number(convertedValue, {
    style: "currency",
    currency: selectedCurrency,
    ...(hideFractionDigits
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : {}),
  });

  if (includeCurrencyCode) currencyString += ` (${selectedCurrency})`;

  return <>{currencyString}</>;
}
