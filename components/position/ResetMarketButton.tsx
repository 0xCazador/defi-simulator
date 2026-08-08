import { ActionIcon, Tooltip } from "@mantine/core";
import { Trans, t } from "@lingui/macro";
import { RxReset } from "react-icons/rx";

import { useAaveData } from "../../hooks/useAaveData";

export const ResetMarketButton = () => {
  const { addressData, currentMarket, resetCurrentMarketChanges } =
    useAaveData("");
  const data = addressData?.[currentMarket];

  let isAnyModified: boolean = false;

  if (
    data.workingData?.userReservesData.length !==
    data.fetchedData?.userReservesData.length
  ) {
    isAnyModified = true;
  }

  if (
    data.workingData?.userBorrowsData.length !==
    data.fetchedData?.userBorrowsData.length
  ) {
    isAnyModified = true;
  }

  if (data.workingData?.healthFactor !== data.fetchedData?.healthFactor) {
    isAnyModified = true;
  }

  if (!isAnyModified) return null;

  const label = <Trans>Reset all simulated values</Trans>;

  return (
    <Tooltip label={label} position="top-end" withArrow>
      <ActionIcon
        aria-label={t`Reset all simulated values`}
        onClick={resetCurrentMarketChanges}
      >
        <RxReset size={18} color="var(--sim-changed)" />
      </ActionIcon>
    </Tooltip>
  );
};

export default ResetMarketButton;
