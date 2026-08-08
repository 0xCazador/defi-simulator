import { useRef } from "react";
import { Trans } from "@lingui/macro";
import { Alert, Button, Space } from "@mantine/core";
import { FiAlertTriangle } from "react-icons/fi";

import { useAaveData, HealthFactorData, markets } from "../hooks/useAaveData";
import { HealthFactorAddressSummary } from "./position/HealthFactorAddressSummary";
import { HealthFactorSkeleton } from "./position/HealthFactorSkeleton";
import { HealthFactorSummary } from "./position/HealthFactorSummary";
import { ExtendedPositionDetails } from "./position/ExtendedPositionDetails";
import { LiquidationScenario } from "./position/LiquidationScenario";
import { UserReserveAssetList } from "./assets/UserReserveAssetList";
import { UserBorrowedAssetList } from "./assets/UserBorrowedAssetList";

const AddressCard = () => {
  const {
    addressData,
    currentMarket,
    applyLiquidationScenario,
    retryFetchMarket,
  } = useAaveData("");
  const data = addressData?.[currentMarket] as HealthFactorData;
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryOffset: number = summaryRef?.current?.clientHeight || 0;
  const isIsolationMode: boolean = !!data?.workingData?.isInIsolationMode;
  const isError: boolean = !!data?.fetchError?.length;
  // Each market renders as soon as its own data arrives; other markets may
  // still be loading (or have failed) without blocking this one.
  const isLoadingCurrentMarket: boolean = !data?.lastFetched;
  const marketName =
    markets.find((market) => market.id === currentMarket)?.title ||
    "Unknown Market";

  return (
    <div style={{ marginTop: "15px" }}>
      <HealthFactorAddressSummary addressData={addressData} />
      <div
        style={{ zIndex: "6", backgroundColor: "var(--mantine-color-body)" }}
      >
        {isError && (
          <Alert
            mb={15}
            mt={45}
            icon={<FiAlertTriangle size="1rem" />}
            title={<Trans>Error Loading Market Data!</Trans>}
            color="red"
            variant="outline"
          >
            <Trans>
              {`An error occurred while loading data for this market (${marketName}). Try again later, or select a different market.`}
            </Trans>
            <div style={{ marginTop: "10px" }}>
              <Button
                size="xs"
                color="red"
                variant="outline"
                onClick={() => retryFetchMarket(currentMarket)}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          </Alert>
        )}
        {isIsolationMode && (
          <Alert
            mb={15}
            mt={45}
            icon={<FiAlertTriangle size="1rem" />}
            title={<Trans>Isolation Mode Not Supported!</Trans>}
            color="red"
            variant="outline"
          >
            <Trans>
              This debt position has Isolation Mode enabled, but DeFi Simulator
              does not yet support positions with Isolation mode enabled. We
              hope to add support for Isolation Mode soon.
            </Trans>
          </Alert>
        )}
        {!isIsolationMode && !isError && (
          <>
            {isLoadingCurrentMarket ? (
              <HealthFactorSkeleton animate />
            ) : (
              <>
                <HealthFactorSummary summaryRef={summaryRef} data={data} />
                <ExtendedPositionDetails data={data} />
                <LiquidationScenario
                  data={data}
                  applyLiquidationScenario={applyLiquidationScenario}
                />
                <UserReserveAssetList summaryOffset={summaryOffset} />
                <Space h="xl" />
                <Space h="xl" />
                <UserBorrowedAssetList summaryOffset={summaryOffset} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AddressCard;
