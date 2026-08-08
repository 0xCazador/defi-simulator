import { Center, Loader, Popover, Skeleton, Text } from "@mantine/core";
import { Trans, Plural } from "@lingui/macro";
import { FaBolt } from "react-icons/fa";

import {
  useAaveData,
  markets,
  ReserveAssetDataItem,
  AaveMarketDataType,
} from "../../hooks/useAaveData";
import { formatEModeLabel } from "../../utils/liquidEMode";
import { AbbreviatedEthereumAddress } from "./AbbreviatedEthereumAddress";

type HealthFactorAddressSummaryProps = {
  addressData: any;
};

export const HealthFactorAddressSummary = ({
  addressData,
}: HealthFactorAddressSummaryProps) => {
  const { isFetching, currentAddress, currentMarket } = useAaveData("");
  const count = markets.filter(
    (market) => addressData?.[market.id]?.fetchedData?.healthFactor > -1
  ).length;

  const market: AaveMarketDataType | undefined = markets.find(
    (mkts) => mkts.id === currentMarket
  );
  const workingData = addressData?.[currentMarket]?.workingData;
  const isEmode: boolean = (workingData?.userEmodeCategoryId || 0) !== 0;
  const eModeLabel: string = formatEModeLabel(
    workingData?.userEmodeLabel ||
      workingData?.userReservesData?.find(
        (r: ReserveAssetDataItem) => r.asset.isEModeCollateral
      )?.asset.eModeLabel ||
      ""
  );

  // Only block on the currently selected market; while other markets are
  // still loading, show progressive results with a "checking" indicator.
  const isLoadingCurrentMarket: boolean =
    !addressData?.[currentMarket]?.lastFetched;

  if (isLoadingCurrentMarket) {
    return (
      <Center>
        <Skeleton height={50} />
      </Center>
    );
  }

  return (
    <>
      <Center>
        {/* The loader is absolutely positioned (out of document flow) so it
            appears and disappears without shifting the layout. */}
        <div style={{ position: "relative", display: "inline-block" }}>
          {count ? (
            <Text size="sm" style={{ display: "inline-block" }}>
              <AbbreviatedEthereumAddress address={currentAddress} />
              {":  "}
              <Trans>Found</Trans> Aave{" "}
              <Plural value={Number(count)} one="position" other="positions" />{" "}
              <Trans>in</Trans> {count}{" "}
              <Plural value={Number(count)} one="market" other="markets" />.
            </Text>
          ) : isFetching ? (
            <Text size="sm" style={{ display: "inline-block" }}>
              <AbbreviatedEthereumAddress address={currentAddress} />
              {": "}
              <Trans>Checking Aave markets for positions…</Trans>
            </Text>
          ) : (
            <Text size="sm" style={{ display: "inline-block" }}>
              <AbbreviatedEthereumAddress address={currentAddress} />
              {": "}
              <Trans>No Aave positions found.</Trans>
            </Text>
          )}
          {isFetching && (
            <Loader
              size="xs"
              type="dots"
              style={{
                position: "absolute",
                left: "100%",
                top: "50%",
                transform: "translateY(-50%)",
                marginLeft: "8px",
              }}
            />
          )}
        </div>
      </Center>

      <Center>
        <Text span size="sm" mt="md" style={{ display: "inline-block" }}>
          {market && ` ${market.title} `}
          {market && <Trans>market selected.</Trans>}
          {isEmode && (
            <Text ml="xs" span>
              <FaBolt />{" "}
              <Popover width="250px" withArrow shadow="md">
                <Popover.Target>
                  <Text
                    span
                    td="underline"
                    style={{ textDecorationStyle: "dotted", cursor: "pointer" }}
                  >
                    <Trans>E-Mode</Trans>
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Text size="sm">
                    <Trans>
                      Efficiency Mode (E-Mode) is enabled for this position.
                      E-Mode allows higher loan-to-value and liquidation
                      thresholds when the supplied and borrowed assets belong to
                      the same category.
                    </Trans>
                    {eModeLabel && (
                      <Text size="sm" mt="xs">
                        <Trans>Active E-Mode category:</Trans>{" "}
                        <Text span fw={700}>
                          {eModeLabel}
                        </Text>
                      </Text>
                    )}
                  </Text>
                </Popover.Dropdown>
              </Popover>
            </Text>
          )}
        </Text>
      </Center>

      <Center>
        <Text size="sm" ta="center" mt="md" mb="lg">
          <Trans>
            Adjust the assets below to see how health factor and borrowing power
            respond.
          </Trans>
        </Text>
      </Center>
    </>
  );
};

export default HealthFactorAddressSummary;
