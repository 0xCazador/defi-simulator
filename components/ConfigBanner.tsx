import { t, Trans } from "@lingui/macro";
import { NextRouter, useRouter } from "next/router";
import {
  Alert,
  Button,
  Group,
  Popover,
  ScrollArea,
  Switch,
  Text,
} from "@mantine/core";
import { TbAdjustmentsHorizontal } from "react-icons/tb";

import {
  EModeCategoryData,
  markets,
  useAaveData,
} from "../hooks/useAaveData";
import { flattenRiskOverrides } from "../utils/riskOverrides";
import { formatEModeLabel } from "../utils/liquidEMode";
import {
  formatRiskFieldValue,
  getKnownAssets,
  getRiskFieldLabel,
  resolveOriginalRiskFieldValue,
} from "./RiskParamsEditor";

/**
 * Banner shown when a shared risk parameter config (from a `?config=` URL)
 * is loaded. Explains what the config simulates, links to the governance
 * reference, and offers a live apply/disable toggle.
 */
export default function ConfigBanner() {
  const router: NextRouter = useRouter();
  const {
    addressData,
    sharedRiskConfig,
    sharedRiskConfigEnabled,
    setSharedRiskConfig,
    setSharedRiskConfigEnabled,
  } = useAaveData("");

  if (!sharedRiskConfig) return null;

  const market = markets.find((m) => m.id === sharedRiskConfig.marketId);
  const overrides = sharedRiskConfig.overrides;
  const entries = flattenRiskOverrides(overrides);
  const label = overrides.meta?.label;
  const refUrl = overrides.meta?.ref;

  const configMarketData = addressData?.[sharedRiskConfig.marketId];
  const knownAssets = getKnownAssets(configMarketData);
  const eModes = configMarketData?.workingData?.eModes as
    | EModeCategoryData[]
    | undefined;

  const handleDismiss = () => {
    setSharedRiskConfig(null);
    // Drop the config param so a refresh doesn't resurrect the banner.
    const { config, ...remainingQuery } = router.query;
    router.replace({ query: remainingQuery }, undefined, { shallow: true });
  };

  return (
    <Alert
      mt={15}
      icon={<TbAdjustmentsHorizontal size="1rem" />}
      title={
        label ? (
          <Trans>Simulated Risk Parameter Config: {label}</Trans>
        ) : (
          <Trans>Simulated Risk Parameter Config</Trans>
        )
      }
      color="indigo"
      variant="outline"
      withCloseButton
      onClose={handleDismiss}
      closeButtonLabel={t`Remove config`}
    >
      <Text size="sm" mb="xs">
        <Trans>
          This link simulates changes to asset risk parameters in the{" "}
          {market?.title || sharedRiskConfig.marketId} market. No real
          positions or protocol settings are affected.
        </Trans>
      </Text>

      <Group spacing="md">
        <Switch
          size="sm"
          checked={sharedRiskConfigEnabled}
          onChange={(event) =>
            setSharedRiskConfigEnabled(event.currentTarget.checked)
          }
          label={t`Apply to simulation`}
        />

        <Popover width="300px" position="bottom" withArrow shadow="md">
          <Popover.Target>
            <Button variant="subtle" color="gray" compact>
              <Trans>View changes ({entries.length})</Trans>
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <ScrollArea.Autosize mah={220}>
              {entries.map((entry) => {
                const original = resolveOriginalRiskFieldValue(
                  entry,
                  knownAssets,
                  eModes
                );
                const category = eModes?.find(
                  (c) => String(c.id) === entry.key
                );
                const keyLabel =
                  entry.kind === "asset"
                    ? entry.key
                    : t`E-Mode: ${formatEModeLabel(category?.label) || entry.key
                      }`;
                return (
                  <Text
                    size="xs"
                    key={`${entry.kind}-${entry.key}-${entry.field}`}
                    mb={4}
                  >
                    <Text span fw={600}>
                      {keyLabel}
                    </Text>
                    {" — "}
                    {getRiskFieldLabel(entry.field)}
                    {": "}
                    {original !== undefined && (
                      <Text span c="dimmed">
                        {formatRiskFieldValue(entry.field, original)} ➔{" "}
                      </Text>
                    )}
                    <Text span fw={600}>
                      {formatRiskFieldValue(entry.field, entry.value)}
                    </Text>
                  </Text>
                );
              })}
            </ScrollArea.Autosize>
          </Popover.Dropdown>
        </Popover>

        {refUrl && (
          <a
            href={refUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#e9ecef", fontSize: "13px" }}
          >
            <Trans>View reference</Trans>
          </a>
        )}
      </Group>
    </Alert>
  );
}
