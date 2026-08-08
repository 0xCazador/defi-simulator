import * as React from "react";
import { t, Trans } from "@lingui/macro";
import { NextRouter, useRouter } from "next/router";

import {
  Accordion,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Select,
  Space,
  Stepper,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { RxReset } from "react-icons/rx";
import { FaBolt, FaCopy } from "react-icons/fa";
import { TbAdjustmentsHorizontal } from "react-icons/tb";

import {
  AssetDetails,
  EModeCategoryData,
  markets,
  useAaveData,
} from "../hooks/useAaveData";
import {
  AssetRiskOverride,
  EModeCategoryOverride,
  SharedRiskConfig,
  encodeRiskConfig,
  hasAnyRiskOverrides,
  sanitizeRiskOverrides,
} from "../utils/riskOverrides";
import { formatEModeLabel } from "../utils/liquidEMode";
import TokenIcon from "./TokenIcon";
import {
  CapOverrideField,
  FlagOverrideField,
  PercentOverrideField,
  getKnownAssets,
} from "./RiskParamsEditor";

/**
 * Wizard that builds a shareable risk parameter config URL (#17):
 * pick a market, pick assets, set parameters, then copy the generated
 * link (or apply the config immediately to this session).
 */

type ConfiguratorDialogProps = {
  opened: boolean;
  onClose: () => void;
};

export const ConfiguratorDialog = ({
  opened,
  onClose,
}: ConfiguratorDialogProps) => {
  const router: NextRouter = useRouter();
  const { addressData, currentMarket, currentAddress, setSharedRiskConfig } =
    useAaveData("", true);

  const [step, setStep] = React.useState(0);
  const [marketId, setMarketId] = React.useState<string>(currentMarket);
  const [searchText, setSearchText] = React.useState("");
  const [selectedSymbols, setSelectedSymbols] = React.useState<string[]>([]);
  const [assetDrafts, setAssetDrafts] = React.useState<
    Record<string, AssetRiskOverride>
  >({});
  const [categoryDrafts, setCategoryDrafts] = React.useState<
    Record<string, EModeCategoryOverride>
  >({});
  const [configLabel, setConfigLabel] = React.useState("");
  const [configRef, setConfigRef] = React.useState("");
  const [showCopied, setShowCopied] = React.useState(false);

  const marketData = addressData?.[marketId];
  const knownAssets = getKnownAssets(marketData).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
  const eModes = (marketData?.workingData?.eModes || []) as EModeCategoryData[];

  const resetWizard = () => {
    setStep(0);
    setSearchText("");
    setSelectedSymbols([]);
    setAssetDrafts({});
    setCategoryDrafts({});
    setConfigLabel("");
    setConfigRef("");
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const setAssetDraftField = (
    symbol: string,
    field: string,
    value: number | boolean | undefined
  ) => {
    setAssetDrafts((prev) => {
      const draft: Record<string, number | boolean | undefined> = {
        ...(prev[symbol] || {}),
      };
      if (value === undefined) {
        delete draft[field];
      } else {
        draft[field] = value;
      }
      return { ...prev, [symbol]: draft as AssetRiskOverride };
    });
  };

  const setCategoryDraftField = (
    categoryId: number,
    field: "ltv" | "liquidationThreshold",
    value: number | undefined
  ) => {
    setCategoryDrafts((prev) => {
      const draft: Record<string, number | undefined> = {
        ...(prev[String(categoryId)] || {}),
      };
      if (value === undefined) {
        delete draft[field];
      } else {
        draft[field] = value;
      }
      return { ...prev, [String(categoryId)]: draft as EModeCategoryOverride };
    });
  };

  const buildConfig = (): SharedRiskConfig | null => {
    const assets: Record<string, AssetRiskOverride> = {};
    selectedSymbols.forEach((symbol) => {
      if (assetDrafts[symbol] && Object.keys(assetDrafts[symbol]).length) {
        assets[symbol] = assetDrafts[symbol];
      }
    });
    const overrides = sanitizeRiskOverrides({
      assets,
      eModeCategories: categoryDrafts,
      meta: { label: configLabel, ref: configRef },
    });
    if (!hasAnyRiskOverrides(overrides)) return null;
    return { marketId, overrides };
  };

  const config = buildConfig();
  const encoded = config ? encodeRiskConfig(config) : "";
  const shareUrl =
    config && typeof window !== "undefined"
      ? `${window.location.origin}/?${currentAddress ? `address=${currentAddress}&` : ""
      }config=${encoded}`
      : "";

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2500);
  };

  const handleApply = () => {
    if (!config) return;
    setSharedRiskConfig(config);
    // Reflect the config in the URL so a refresh (or copied address bar)
    // preserves it.
    router.replace(
      { query: { ...router.query, config: encoded } },
      undefined,
      { shallow: true }
    );
    handleClose();
  };

  const filteredAssets = knownAssets.filter((asset) => {
    if (!searchText.length) return true;
    return (
      asset.name?.toUpperCase().includes(searchText.toUpperCase()) ||
      asset.symbol?.toUpperCase().includes(searchText.toUpperCase())
    );
  });

  const draftCount =
    Object.values(assetDrafts).reduce(
      (acc, draft) => acc + Object.keys(draft).length,
      0
    ) +
    Object.values(categoryDrafts).reduce(
      (acc, draft) => acc + Object.keys(draft).length,
      0
    );

  return (
    <Modal
      size="xl"
      opened={opened}
      onClose={handleClose}
      title={t`Risk Parameter Configurator`}
    >
      <Text size="sm" c="dimmed" mb="md">
        <Trans>
          Build a shareable link that simulates asset risk parameter changes,
          e.g. a pending governance proposal. Anyone opening the link sees the
          changes applied to their position, with a toggle to compare.
        </Trans>
      </Text>

      <Stepper active={step} onStepClick={setStep} size="xs" breakpoint="xs">
        <Stepper.Step label={t`Market`}>
          <Space h="md" />
          <Select
            label={t`Market`}
            description={t`The market whose risk parameters the config changes.`}
            value={marketId}
            onChange={(value) => {
              if (!value || value === marketId) return;
              setMarketId(value);
              setSelectedSymbols([]);
              setAssetDrafts({});
              setCategoryDrafts({});
            }}
            data={markets.map((market) => ({
              value: market.id,
              label: market.title,
            }))}
          />
          <Group position="right" mt="lg">
            <Button onClick={() => setStep(1)}>
              <Trans>Next: Select Assets</Trans>
            </Button>
          </Group>
        </Stepper.Step>

        <Stepper.Step label={t`Assets`}>
          <Space h="md" />
          {knownAssets.length === 0 ? (
            <Text size="sm">
              <Trans>
                No asset data is loaded for this market yet. Load an address
                first so asset details are available.
              </Trans>
            </Text>
          ) : (
            <>
              <TextInput
                value={searchText}
                label={t`Search Assets`}
                onChange={(e) => setSearchText(e.target.value)}
                size="sm"
                mb={8}
                rightSection={
                  searchText?.length > 0 && (
                    <Tooltip
                      label={t`Reset search query`}
                      position="top-end"
                      withArrow
                    >
                      <RxReset
                        size={18}
                        style={{ display: "block", cursor: "pointer" }}
                        onClick={() => setSearchText("")}
                      />
                    </Tooltip>
                  )
                }
              />
              <ScrollArea.Autosize mah={260}>
                {filteredAssets.map((asset) => (
                  <Checkbox
                    key={asset.symbol}
                    size="sm"
                    mb={6}
                    checked={selectedSymbols.includes(asset.symbol)}
                    onChange={(e) => {
                      setSelectedSymbols((prev) =>
                        e.currentTarget.checked
                          ? [...prev, asset.symbol]
                          : prev.filter((s) => s !== asset.symbol)
                      );
                    }}
                    label={
                      <Group spacing={6}>
                        <TokenIcon
                          symbol={asset.symbol}
                          size="18px"
                          alt={asset.symbol}
                        />
                        <Text size="sm">{asset.symbol}</Text>
                      </Group>
                    }
                  />
                ))}
              </ScrollArea.Autosize>
            </>
          )}
          <Group position="apart" mt="lg">
            <Button variant="subtle" color="gray" onClick={() => setStep(0)}>
              <Trans>Back</Trans>
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedSymbols.length && !eModes.length}
            >
              <Trans>Next: Set Parameters</Trans>
            </Button>
          </Group>
        </Stepper.Step>

        <Stepper.Step label={t`Parameters`}>
          <Space h="md" />
          {selectedSymbols.length > 0 && (
            <Accordion variant="separated" multiple>
              {selectedSymbols.map((symbol) => {
                const asset = knownAssets.find(
                  (a) => a.symbol === symbol
                ) as AssetDetails;
                if (!asset) return null;
                const draft = assetDrafts[symbol] || {};
                const overriddenCount = Object.keys(draft).length;
                return (
                  <Accordion.Item value={symbol} key={symbol}>
                    <Accordion.Control
                      icon={
                        <TokenIcon
                          symbol={symbol}
                          size="20px"
                          alt={symbol}
                        />
                      }
                    >
                      <Group spacing={8}>
                        <Text fw={600}>{symbol}</Text>
                        {overriddenCount > 0 && (
                          <Text size="xs" c="#FFFF00">
                            <Trans>({overriddenCount} changed)</Trans>
                          </Text>
                        )}
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Group grow align="flex-start" mb="xs">
                        <PercentOverrideField
                          label={t`Max LTV`}
                          originalBps={asset.baseLTVasCollateral}
                          overrideBps={draft.ltv}
                          onOverrideChange={(bps) =>
                            setAssetDraftField(symbol, "ltv", bps)
                          }
                        />
                        <PercentOverrideField
                          label={t`Liquidation Threshold`}
                          originalBps={asset.reserveLiquidationThreshold}
                          overrideBps={draft.liquidationThreshold}
                          onOverrideChange={(bps) =>
                            setAssetDraftField(
                              symbol,
                              "liquidationThreshold",
                              bps
                            )
                          }
                        />
                      </Group>
                      <Group grow align="flex-start" mb="xs">
                        <CapOverrideField
                          label={t`Supply Cap`}
                          description={t`0 means no cap`}
                          originalCap={asset.supplyCap}
                          overrideCap={draft.supplyCap}
                          onOverrideChange={(cap) =>
                            setAssetDraftField(symbol, "supplyCap", cap)
                          }
                        />
                        <CapOverrideField
                          label={t`Borrow Cap`}
                          description={t`0 means no cap`}
                          originalCap={asset.borrowCap}
                          overrideCap={draft.borrowCap}
                          onOverrideChange={(cap) =>
                            setAssetDraftField(symbol, "borrowCap", cap)
                          }
                        />
                      </Group>
                      <FlagOverrideField
                        label={t`Usable as Collateral`}
                        originalValue={asset.usageAsCollateralEnabled}
                        overrideValue={draft.usageAsCollateralEnabled}
                        onOverrideChange={(value) =>
                          setAssetDraftField(
                            symbol,
                            "usageAsCollateralEnabled",
                            value
                          )
                        }
                      />
                      <FlagOverrideField
                        label={t`Borrowing Enabled`}
                        originalValue={asset.borrowingEnabled}
                        overrideValue={draft.borrowingEnabled}
                        onOverrideChange={(value) =>
                          setAssetDraftField(symbol, "borrowingEnabled", value)
                        }
                      />
                      <FlagOverrideField
                        label={t`Frozen`}
                        originalValue={asset.isFrozen}
                        overrideValue={draft.isFrozen}
                        onOverrideChange={(value) =>
                          setAssetDraftField(symbol, "isFrozen", value)
                        }
                      />
                      <FlagOverrideField
                        label={t`Paused`}
                        originalValue={asset.isPaused}
                        overrideValue={draft.isPaused}
                        onOverrideChange={(value) =>
                          setAssetDraftField(symbol, "isPaused", value)
                        }
                      />
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          )}

          {eModes.length > 0 && (
            <>
              <Divider
                label={
                  <Text size="xs">
                    <FaBolt /> <Trans>E-Mode Categories</Trans>
                  </Text>
                }
                mb={8}
                mt={16}
                labelPosition="center"
              />
              <Text size="xs" c="dimmed" mb="xs">
                <Trans>
                  Category values apply to every asset that participates in
                  the category while E-Mode is active.
                </Trans>
              </Text>
              <Accordion variant="separated" multiple>
                {eModes.map((category) => {
                  const draft = categoryDrafts[String(category.id)] || {};
                  const overriddenCount = Object.keys(draft).length;
                  return (
                    <Accordion.Item
                      value={String(category.id)}
                      key={category.id}
                    >
                      <Accordion.Control>
                        <Group spacing={8}>
                          <Text fw={600} size="sm">
                            {formatEModeLabel(category.label) || category.id}
                          </Text>
                          {overriddenCount > 0 && (
                            <Text size="xs" c="#FFFF00">
                              <Trans>({overriddenCount} changed)</Trans>
                            </Text>
                          )}
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Group grow align="flex-start">
                          <PercentOverrideField
                            label={t`E-Mode Max LTV`}
                            originalBps={category.ltv}
                            overrideBps={draft.ltv}
                            onOverrideChange={(bps) =>
                              setCategoryDraftField(category.id, "ltv", bps)
                            }
                          />
                          <PercentOverrideField
                            label={t`E-Mode Liquidation Threshold`}
                            originalBps={category.liquidationThreshold}
                            overrideBps={draft.liquidationThreshold}
                            onOverrideChange={(bps) =>
                              setCategoryDraftField(
                                category.id,
                                "liquidationThreshold",
                                bps
                              )
                            }
                          />
                        </Group>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </>
          )}

          <Group position="apart" mt="lg">
            <Button variant="subtle" color="gray" onClick={() => setStep(1)}>
              <Trans>Back</Trans>
            </Button>
            <Button onClick={() => setStep(3)} disabled={!draftCount}>
              <Trans>Next: Review & Share</Trans>
            </Button>
          </Group>
        </Stepper.Step>

        <Stepper.Step label={t`Share`}>
          <Space h="md" />
          <TextInput
            value={configLabel}
            label={t`Config Label (optional)`}
            description={t`Shown in the banner when someone opens the link.`}
            placeholder={t`e.g. Gauntlet WETH parameter update`}
            onChange={(e) => setConfigLabel(e.target.value)}
            size="sm"
            mb={8}
          />
          <TextInput
            value={configRef}
            label={t`Reference URL (optional)`}
            description={t`e.g. an Aave governance forum post explaining the change.`}
            placeholder="https://governance.aave.com/t/..."
            onChange={(e) => setConfigRef(e.target.value)}
            size="sm"
            mb={8}
          />

          {config ? (
            <>
              <TextInput
                value={shareUrl}
                label={t`Shareable Link`}
                readOnly
                size="sm"
                mb={8}
                rightSection={
                  <Tooltip
                    label={
                      showCopied
                        ? t`Link copied to clipboard!`
                        : t`Copy link to clipboard`
                    }
                    opened={showCopied ? true : undefined}
                    color={showCopied ? "green" : undefined}
                    position="top-end"
                    withArrow
                  >
                    <span>
                      <FaCopy
                        style={{ cursor: "pointer" }}
                        onClick={handleCopy}
                      />
                    </span>
                  </Tooltip>
                }
              />
              <Group position="apart" mt="lg">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => setStep(2)}
                >
                  <Trans>Back</Trans>
                </Button>
                <Group>
                  <Button variant="outline" onClick={handleCopy}>
                    <Trans>Copy Link</Trans>
                  </Button>
                  <Button onClick={handleApply}>
                    <Trans>Apply Now</Trans>
                  </Button>
                </Group>
              </Group>
            </>
          ) : (
            <Text size="sm" mt="md">
              <Trans>
                No parameter changes configured yet. Go back and adjust at
                least one parameter.
              </Trans>
            </Text>
          )}
        </Stepper.Step>
      </Stepper>
    </Modal>
  );
};

/** Button entry point for the configurator. */
export const ConfiguratorButton = () => {
  const [opened, setOpened] = React.useState(false);

  return (
    <>
      {opened && (
        <ConfiguratorDialog opened={opened} onClose={() => setOpened(false)} />
      )}
      <Button
        variant="subtle"
        color="gray"
        compact
        leftIcon={<TbAdjustmentsHorizontal size={14} />}
        onClick={() => setOpened(true)}
      >
        <Trans>Risk Parameter Configurator</Trans>
      </Button>
    </>
  );
};
