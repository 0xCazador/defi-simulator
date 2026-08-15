import {
  Badge,
  Center,
  Group,
  Loader,
  Popover,
  Skeleton,
  Text,
} from "@mantine/core";
import { Trans, Plural } from "@lingui/macro";
import { FaBolt } from "react-icons/fa";

import {
  useAaveData,
  markets,
  getIconNameFromMarket,
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

  const separator = (
    <Text size="sm" c="dimmed" span>
      ·
    </Text>
  );

  return (
    <>
      <Center>
        {/* The loader is absolutely positioned (out of document flow) so it
            appears and disappears without shifting the layout. */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <Group justify="center" gap={10} wrap="wrap">
            {market && (
              <Group gap={6} wrap="nowrap">
                <img
                  src={`/icons/networks/${getIconNameFromMarket(market)}.svg`}
                  width="18px"
                  height="18px"
                  alt=""
                  // Block, so it centers as a flex item instead of sitting on
                  // the adjacent text's baseline.
                  style={{ display: "block" }}
                />
                <Text size="sm" fw={600}>
                  {market.title}
                </Text>
              </Group>
            )}
            {market && separator}
            <Text size="sm" c="dimmed" ff="monospace">
              <AbbreviatedEthereumAddress address={currentAddress} />
            </Text>
            {separator}
            {count ? (
              <Badge
                variant="light"
                color="green"
                radius="sm"
                tt="none"
                fw={500}
              >
                <Plural
                  value={Number(count)}
                  one="Aave position in # market"
                  other="Aave positions in # markets"
                />
              </Badge>
            ) : isFetching ? (
              <Text size="sm" c="dimmed">
                <Trans>Checking Aave markets…</Trans>
              </Text>
            ) : (
              <Badge
                variant="light"
                color="gray"
                radius="sm"
                tt="none"
                fw={500}
              >
                <Trans>No Aave positions found</Trans>
              </Badge>
            )}
            {isEmode && (
              <Popover width="250px" withArrow shadow="md">
                <Popover.Target>
                  <Badge
                    variant="light"
                    color="yellow"
                    radius="sm"
                    tt="none"
                    fw={500}
                    leftSection={<FaBolt size={10} />}
                    style={{ cursor: "pointer" }}
                  >
                    <Trans>E-Mode</Trans>
                  </Badge>
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
            )}
          </Group>
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
        <Text size="xs" c="dimmed" ta="center" mt="xs" mb="lg">
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
