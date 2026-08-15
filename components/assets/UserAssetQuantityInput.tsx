import { useEffect, useRef } from "react";
import { Indicator, TextInput } from "@mantine/core";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { formatTokenAmount } from "../../utils/formatTokenAmount";
import { AssetSlider } from "./AssetSlider";
import { ResetInputValueIcon } from "./ResetInputValueIcon";
import { ensureTinyNumberFormatting } from "./formatTinyNumber";

type UserAssetQuantityInputProps = {
  assetSymbol: string;
  workingQuantity: number;
  originalQuantity: number;
  isNewlyAddedBySimUser: boolean;
  setAssetQuantity: (symbol: string, quantity: number) => void;
};

export const UserAssetQuantityInput = ({
  assetSymbol,
  workingQuantity,
  originalQuantity,
  isNewlyAddedBySimUser,
  setAssetQuantity,
}: UserAssetQuantityInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { i18n } = useLingui();

  useEffect(() => {
    // if it's a new asset, scroll into view and focus
    if (isNewlyAddedBySimUser) {
      inputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
      setTimeout(() => inputRef.current?.focus(), 250); // setTimeout req'd due to react race condition here
    }
  }, [!!inputRef.current]);

  const handleChange = (value: number) => {
    if (value && value < 0) return;
    if (value === workingQuantity) return;
    setAssetQuantity(assetSymbol, value);
  };

  const resetIcon = (
    <ResetInputValueIcon
      originalValue={originalQuantity}
      workingValue={workingQuantity}
      formattedOriginalValue={`${formatTokenAmount(
        originalQuantity,
        i18n?.locale,
        { compact: false },
      )} ${assetSymbol}`}
      onClick={() => handleChange(originalQuantity)}
    />
  );

  return (
    <>
      <TextInput
        ref={inputRef}
        value={ensureTinyNumberFormatting(workingQuantity) || ""}
        label={t`${assetSymbol} Quantity`}
        labelProps={{ size: "sm" }}
        onChange={(e) => handleChange(Number(e.target.value))}
        size="md"
        type="number"
        inputWrapperOrder={["label", "error", "input", "description"]}
        inputContainer={(children) => (
          <Indicator
            zIndex="3"
            disabled={!originalQuantity || originalQuantity === workingQuantity}
            color="var(--sim-changed)"
          >
            {children}
          </Indicator>
        )}
        rightSection={resetIcon}
      />

      <AssetSlider
        defaultValue={workingQuantity}
        onChange={(value) => handleChange(value)}
      />
    </>
  );
};

export default UserAssetQuantityInput;
