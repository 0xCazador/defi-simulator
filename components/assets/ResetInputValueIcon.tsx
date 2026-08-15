import { ActionIcon, Tooltip } from "@mantine/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { RxReset } from "react-icons/rx";

import { ensureTinyNumberFormatting } from "./formatTinyNumber";

type ResetInputValueIconProps = {
  originalValue: number;
  workingValue: number;
  onClick: () => void;
  /**
   * Display form of `originalValue` (a fiat price or a token quantity with its
   * symbol). Only the caller knows which, so it formats and passes it in.
   */
  formattedOriginalValue?: string;
};

export const ResetInputValueIcon = ({
  originalValue,
  workingValue,
  onClick,
  formattedOriginalValue,
}: ResetInputValueIconProps) => {
  if (!originalValue || originalValue === workingValue) return null;

  const displayValue =
    formattedOriginalValue ?? `${ensureTinyNumberFormatting(originalValue)}`;

  const label = <Trans>{`Reset to Original Value (${displayValue})`}</Trans>;
  return (
    <Tooltip label={label} position="top-end" withArrow>
      <ActionIcon
        aria-label={t`Reset to Original Value (${displayValue})`}
        onClick={onClick}
      >
        <RxReset
          size={18}
          style={{ display: "block" }}
          color="var(--sim-changed)"
        />
      </ActionIcon>
    </Tooltip>
  );
};

export default ResetInputValueIcon;
