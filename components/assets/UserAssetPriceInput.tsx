import { useEffect, useRef } from "react";
import { unformat } from "accounting";
import { Indicator, TextInput } from "@mantine/core";
import { t } from "@lingui/macro";
import { useLingui } from "@lingui/react";

import { useFiatRates } from "../../hooks/useFiatData";
import { AssetSlider } from "./AssetSlider";
import { ResetInputValueIcon } from "./ResetInputValueIcon";

type UserAssetPriceInputProps = {
  assetSymbol: string;
  workingPrice: number;
  originalPrice: number;
  setAssetPriceInUSD: (symbol: string, price: number) => void;
};

export const UserAssetPriceInput = ({
  assetSymbol,
  workingPrice,
  originalPrice,
  setAssetPriceInUSD,
}: UserAssetPriceInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { selectedCurrency, currentRate } = useFiatRates(false);
  const { i18n } = useLingui();

  const workingConvertedPrice = workingPrice * currentRate;
  const originalConvertedPrice = originalPrice * currentRate;

  const formatPrice = (value: number) =>
    i18n.number(value, {
      style: "currency",
      currency: selectedCurrency,
    });

  const formattedWorkingPrice: string = formatPrice(workingConvertedPrice);

  useEffect(() => {
    if (!formattedWorkingPrice) return;
    // the input is uncontrolled, but we need to support external "reset" functionality
    // and selected fiat currency changes
    if (
      inputRef.current &&
      inputRef.current.value !== formattedWorkingPrice &&
      inputRef.current !== document.activeElement // if input is focused, don't apply formatting
    ) {
      inputRef.current.value = formattedWorkingPrice;
    }
  }, [formattedWorkingPrice]);

  if (!selectedCurrency || !currentRate) return null;

  const convertValueToUSDAndSet = (symbol: string, value: number) => {
    const updatedValue = value / currentRate;
    setAssetPriceInUSD(symbol, updatedValue);
  };

  const handleChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingConvertedPrice) return;
    convertValueToUSDAndSet(assetSymbol, value);
  };

  const handleReset = () => {
    if (inputRef.current) {
      inputRef.current.value = formatPrice(originalConvertedPrice);
    }
    handleChange(originalConvertedPrice);
  };

  const handleSliderChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingConvertedPrice) return;
    convertValueToUSDAndSet(assetSymbol, value);
    if (inputRef.current) {
      inputRef.current.value = formatPrice(value);
    }
  };

  const handleBlur = () => {
    if (inputRef.current) {
      inputRef.current.value = formatPrice(workingConvertedPrice);
    }
  };

  const resetIcon = (
    <ResetInputValueIcon
      originalValue={originalConvertedPrice}
      workingValue={workingConvertedPrice}
      formattedOriginalValue={formatPrice(originalConvertedPrice)}
      onClick={handleReset}
    />
  );

  return (
    <>
      <TextInput
        defaultValue={formattedWorkingPrice}
        label={t`${assetSymbol} Price (${selectedCurrency})`}
        labelProps={{ size: "sm" }}
        onChange={(e) => handleChange(unformat(e.target.value))}
        onBlur={handleBlur}
        size="md"
        ref={inputRef}
        inputWrapperOrder={["label", "error", "input", "description"]}
        inputContainer={(children) => (
          <Indicator
            zIndex="3"
            disabled={!originalPrice || originalPrice === workingPrice}
            color="var(--sim-changed)"
          >
            {children}
          </Indicator>
        )}
        rightSection={resetIcon}
      />
      <AssetSlider
        defaultValue={workingConvertedPrice}
        onChange={handleSliderChange}
      />
    </>
  );
};

export default UserAssetPriceInput;
