import * as React from "react";
import { t, Trans } from "@lingui/macro";

import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Indicator,
  Mark,
  Modal,
  Popover,
  ScrollArea,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { RxReset } from "react-icons/rx";
import { TbAdjustmentsHorizontal } from "react-icons/tb";
import { FiAlertTriangle } from "react-icons/fi";
import { FaBolt } from "react-icons/fa";

import {
  AssetDetails,
  BorrowedAssetDataItem,
  EModeCategoryData,
  ReserveAssetDataItem,
  getHealthFactorColor,
  useAaveData,
} from "../hooks/useAaveData";
import {
  RiskOverrideEntry,
  RiskParamOverrides,
  flattenRiskOverrides,
  hasAnyRiskOverrides,
} from "../utils/riskOverrides";
import { formatEModeLabel } from "../utils/liquidEMode";
import { formatNumber } from "accounting";

/**
 *
 * Shared helpers for labeling/formatting risk parameter fields.
 *
 */

export const getRiskFieldLabel = (field: string): string => {
  switch (field) {
    case "ltv":
      return t`Max LTV`;
    case "liquidationThreshold":
      return t`Liquidation Threshold`;
    case "eModeLtv":
      return t`E-Mode Max LTV`;
    case "eModeLiquidationThreshold":
      return t`E-Mode Liquidation Threshold`;
    case "supplyCap":
      return t`Supply Cap`;
    case "borrowCap":
      return t`Borrow Cap`;
    case "borrowingEnabled":
      return t`Borrowing Enabled`;
    case "usageAsCollateralEnabled":
      return t`Usable as Collateral`;
    case "isFrozen":
      return t`Frozen`;
    case "isPaused":
      return t`Paused`;
    default:
      return field;
  }
};

export const formatRiskFieldValue = (
  field: string,
  value: number | boolean | undefined
): string => {
  if (value === undefined) return "---";
  if (typeof value === "boolean") return value ? t`Yes` : t`No`;
  switch (field) {
    case "ltv":
    case "liquidationThreshold":
    case "eModeLtv":
    case "eModeLiquidationThreshold":
      return `${(value / 100).toFixed(1)}%`;
    case "supplyCap":
    case "borrowCap":
      return value === 0 ? t`None` : formatNumber(value);
    default:
      return String(value);
  }
};

/**
 * Resolve the original (on-chain) value of an overridden field, for
 * "original ➔ new" diffs in chips and banners.
 */
export const resolveOriginalRiskFieldValue = (
  entry: RiskOverrideEntry,
  assets: AssetDetails[],
  eModes?: EModeCategoryData[]
): number | boolean | undefined => {
  if (entry.kind === "eModeCategory") {
    const category = eModes?.find((c) => String(c.id) === entry.key);
    if (!category) return undefined;
    return entry.field === "ltv" ? category.ltv : category.liquidationThreshold;
  }
  const asset = assets.find((a) => a.symbol === entry.key);
  if (!asset) return undefined;
  switch (entry.field) {
    case "ltv":
      return asset.baseLTVasCollateral;
    case "liquidationThreshold":
      return asset.reserveLiquidationThreshold;
    case "eModeLtv":
      return asset.eModeLtv;
    case "eModeLiquidationThreshold":
      return asset.eModeLiquidationThreshold;
    case "supplyCap":
      return asset.supplyCap;
    case "borrowCap":
      return asset.borrowCap;
    case "borrowingEnabled":
      return asset.borrowingEnabled;
    case "usageAsCollateralEnabled":
      return asset.usageAsCollateralEnabled;
    case "isFrozen":
      return asset.isFrozen;
    case "isPaused":
      return asset.isPaused;
    default:
      return undefined;
  }
};

/** Collect every asset we know about (position + available) for diffing. */
const getKnownAssets = (marketData: any): AssetDetails[] => {
  const assets: AssetDetails[] = [];
  marketData?.workingData?.userReservesData?.forEach(
    (item: ReserveAssetDataItem) => assets.push(item.asset)
  );
  marketData?.workingData?.userBorrowsData?.forEach(
    (item: BorrowedAssetDataItem) => {
      if (!assets.find((a) => a.symbol === item.asset.symbol))
        assets.push(item.asset);
    }
  );
  marketData?.availableAssets?.forEach((asset: AssetDetails) => {
    if (!assets.find((a) => a.symbol === asset.symbol)) assets.push(asset);
  });
  return assets;
};

/**
 *
 * Field primitives. Controlled by (original, override) pairs so they can be
 * wired either to the store (RiskParamsEditor) or to local draft state
 * (ConfiguratorDialog).
 *
 */

type PercentOverrideFieldProps = {
  label: string;
  description?: string;
  /** basis points */
  originalBps?: number;
  /** basis points */
  overrideBps?: number;
  onOverrideChange: (bps: number | undefined) => void;
  /** shown dimmed with a hint that the field is not currently in effect */
  inactiveHint?: string;
};

export const PercentOverrideField = ({
  label,
  description,
  originalBps,
  overrideBps,
  onOverrideChange,
  inactiveHint,
}: PercentOverrideFieldProps) => {
  const original = originalBps ?? 0;
  const effective = overrideBps ?? original;
  const isOverridden =
    overrideBps !== undefined && overrideBps !== original;

  const handleChange = (raw: string) => {
    if (raw === "") {
      onOverrideChange(undefined);
      return;
    }
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0) return;
    const bps = Math.round(Math.min(pct, 100) * 100);
    onOverrideChange(bps === original ? undefined : bps);
  };

  const resetIcon = isOverridden ? (
    <Tooltip
      label={t`Reset to Original Value (${(original / 100).toFixed(1)}%)`}
      position="top-end"
      withArrow
    >
      <ActionIcon>
        <RxReset
          size={18}
          style={{ display: "block" }}
          onClick={() => onOverrideChange(undefined)}
          color="#FFFF00"
        />
      </ActionIcon>
    </Tooltip>
  ) : null;

  return (
    <div>
      <TextInput
        value={String(Number((effective / 100).toFixed(2)))}
        label={label}
        description={description}
        labelProps={{ size: "sm" }}
        onChange={(e) => handleChange(e.target.value)}
        size="sm"
        type="number"
        step={0.5}
        min={0}
        max={100}
        icon={<Text size="xs">%</Text>}
        inputWrapperOrder={["label", "error", "input", "description"]}
        inputContainer={(children) => (
          <Indicator zIndex="3" disabled={!isOverridden} color="#FFFF00">
            {children}
          </Indicator>
        )}
        rightSection={resetIcon}
      />
      {isOverridden && (
        <Text fz="xs" c="dimmed">
          {`${(original / 100).toFixed(1)}%`} ➔{" "}
          {`${(effective / 100).toFixed(1)}%`}
        </Text>
      )}
      {inactiveHint && (
        <Text fz="xs" c="dimmed" mt={2}>
          {inactiveHint}
        </Text>
      )}
    </div>
  );
};

type CapOverrideFieldProps = {
  label: string;
  description?: string;
  /** whole tokens, 0 = uncapped */
  originalCap?: number;
  overrideCap?: number;
  onOverrideChange: (cap: number | undefined) => void;
};

export const CapOverrideField = ({
  label,
  description,
  originalCap,
  overrideCap,
  onOverrideChange,
}: CapOverrideFieldProps) => {
  const original = originalCap ?? 0;
  const effective = overrideCap ?? original;
  const isOverridden = overrideCap !== undefined && overrideCap !== original;

  const handleChange = (raw: string) => {
    if (raw === "") {
      onOverrideChange(undefined);
      return;
    }
    const cap = Number(raw);
    if (!Number.isFinite(cap) || cap < 0) return;
    onOverrideChange(cap === original ? undefined : cap);
  };

  const resetIcon = isOverridden ? (
    <Tooltip
      label={t`Reset to Original Value (${formatRiskFieldValue(
        "supplyCap",
        original
      )})`}
      position="top-end"
      withArrow
    >
      <ActionIcon>
        <RxReset
          size={18}
          style={{ display: "block" }}
          onClick={() => onOverrideChange(undefined)}
          color="#FFFF00"
        />
      </ActionIcon>
    </Tooltip>
  ) : null;

  return (
    <div>
      <TextInput
        value={String(effective)}
        label={label}
        description={description}
        labelProps={{ size: "sm" }}
        onChange={(e) => handleChange(e.target.value)}
        size="sm"
        type="number"
        min={0}
        inputWrapperOrder={["label", "error", "input", "description"]}
        inputContainer={(children) => (
          <Indicator zIndex="3" disabled={!isOverridden} color="#FFFF00">
            {children}
          </Indicator>
        )}
        rightSection={resetIcon}
      />
      {isOverridden && (
        <Text fz="xs" c="dimmed">
          {formatRiskFieldValue("supplyCap", original)} ➔{" "}
          {formatRiskFieldValue("supplyCap", effective)}
        </Text>
      )}
    </div>
  );
};

type FlagOverrideFieldProps = {
  label: string;
  description?: string;
  originalValue?: boolean;
  overrideValue?: boolean;
  onOverrideChange: (value: boolean | undefined) => void;
};

export const FlagOverrideField = ({
  label,
  description,
  originalValue,
  overrideValue,
  onOverrideChange,
}: FlagOverrideFieldProps) => {
  const original = !!originalValue;
  const effective = overrideValue ?? original;
  const isOverridden =
    overrideValue !== undefined && overrideValue !== original;

  const handleChange = () => {
    const next = !effective;
    onOverrideChange(next === original ? undefined : next);
  };

  const checkbox = (
    <Checkbox
      size="sm"
      checked={effective}
      label={
        <span>
          {label}
          {isOverridden && (
            <Tooltip
              label={t`Reset to Original Value (${original ? t`Yes` : t`No`})`}
              position="top-end"
              withArrow
            >
              <ActionIcon
                display="inline-block"
                ml={4}
                style={{ verticalAlign: "middle" }}
              >
                <RxReset
                  size={14}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOverrideChange(undefined);
                  }}
                  color="#FFFF00"
                />
              </ActionIcon>
            </Tooltip>
          )}
        </span>
      }
      description={description}
      onChange={handleChange}
      mt={5}
      mb={5}
    />
  );

  return isOverridden ? (
    <Indicator zIndex="3" color="#FFFF00" position="top-start">
      {checkbox}
    </Indicator>
  ) : (
    checkbox
  );
};

/**
 *
 * The store-connected per-asset risk parameter editor (#16).
 *
 */

type RiskParamsEditorProps = {
  assetSymbol: string;
  assetType: "RESERVE" | "BORROW";
};

export const RiskParamsEditor = ({
  assetSymbol,
  assetType,
}: RiskParamsEditorProps) => {
  const {
    addressData,
    currentMarket,
    riskOverrides,
    effectiveRiskOverrides,
    setAssetRiskOverride,
    setEModeCategoryRiskOverride,
    clearEModeCategoryRiskOverride,
  } = useAaveData("", true);

  const marketData = addressData?.[currentMarket];
  const workingData = marketData?.workingData;

  const item =
    assetType === "RESERVE"
      ? workingData?.userReservesData?.find(
        (r) => r.asset.symbol === assetSymbol
      )
      : workingData?.userBorrowsData?.find(
        (b) => b.asset.symbol === assetSymbol
      );

  if (!item) return null;

  const asset: AssetDetails = item.asset;
  const override = effectiveRiskOverrides?.assets?.[assetSymbol] || {};

  const userEmodeCategoryId = workingData?.userEmodeCategoryId || 0;
  const eModes = workingData?.eModes;
  const activeCategory = userEmodeCategoryId
    ? eModes?.find((c) => c.id === userEmodeCategoryId)
    : undefined;
  const isEModeCollateral = !!asset.isEModeCollateral;
  const categoryOverride = activeCategory
    ? effectiveRiskOverrides?.eModeCategories?.[String(activeCategory.id)]
    : undefined;

  const usesLegacyEMode =
    !activeCategory &&
    !!userEmodeCategoryId &&
    asset.eModeCategoryId === userEmodeCategoryId;

  const setField = (
    field: string,
    value: number | boolean | undefined
  ) => {
    setAssetRiskOverride(assetSymbol, { [field]: value });
  };

  const hfOriginal = marketData?.fetchedData?.healthFactor;
  const hfCurrent = workingData?.healthFactor;
  const hfDiffers =
    (hfOriginal || 0) > -1 &&
    hfOriginal?.toFixed(2) !== hfCurrent?.toFixed(2);

  return (
    <div>
      <Text size="sm" c="dimmed" mb="xs">
        <Trans>
          Simulate governance changes to this asset's risk parameters. Edits
          only affect this simulation, never the live protocol.
        </Trans>
      </Text>

      {assetType === "RESERVE" && (
        <>
          <Group grow align="flex-start" mb="xs">
            <PercentOverrideField
              label={t`Max LTV`}
              originalBps={asset.baseLTVasCollateral}
              overrideBps={override.ltv}
              onOverrideChange={(bps) => setField("ltv", bps)}
              inactiveHint={
                isEModeCollateral
                  ? t`Not currently in effect: E-Mode category values apply to this asset.`
                  : undefined
              }
            />
            <PercentOverrideField
              label={t`Liquidation Threshold`}
              originalBps={asset.reserveLiquidationThreshold}
              overrideBps={override.liquidationThreshold}
              onOverrideChange={(bps) =>
                setField("liquidationThreshold", bps)
              }
              inactiveHint={
                isEModeCollateral
                  ? t`Not currently in effect: E-Mode category values apply to this asset.`
                  : undefined
              }
            />
          </Group>

          {activeCategory && isEModeCollateral && (
            <>
              <Divider
                label={
                  <Text size="xs">
                    <FaBolt />{" "}
                    <Trans>
                      E-Mode: {formatEModeLabel(activeCategory.label) ||
                        activeCategory.id}
                    </Trans>
                  </Text>
                }
                mb={8}
                mt={8}
                labelPosition="center"
              />
              <Text size="xs" c="dimmed" mb="xs">
                <Trans>
                  This asset is E-Mode collateral, so the E-Mode category's
                  values apply. Category changes affect every asset in the
                  category.
                </Trans>
              </Text>
              <Group grow align="flex-start" mb="xs">
                <PercentOverrideField
                  label={t`E-Mode Max LTV`}
                  originalBps={activeCategory.ltv}
                  overrideBps={categoryOverride?.ltv}
                  onOverrideChange={(bps) =>
                    setEModeCategoryRiskOverride(activeCategory.id, {
                      ltv: bps,
                    })
                  }
                />
                <PercentOverrideField
                  label={t`E-Mode Liquidation Threshold`}
                  originalBps={activeCategory.liquidationThreshold}
                  overrideBps={categoryOverride?.liquidationThreshold}
                  onOverrideChange={(bps) =>
                    setEModeCategoryRiskOverride(activeCategory.id, {
                      liquidationThreshold: bps,
                    })
                  }
                />
              </Group>
            </>
          )}

          {usesLegacyEMode && (
            <Group grow align="flex-start" mb="xs">
              <PercentOverrideField
                label={t`E-Mode Max LTV`}
                originalBps={asset.eModeLtv}
                overrideBps={override.eModeLtv}
                onOverrideChange={(bps) => setField("eModeLtv", bps)}
              />
              <PercentOverrideField
                label={t`E-Mode Liquidation Threshold`}
                originalBps={asset.eModeLiquidationThreshold}
                overrideBps={override.eModeLiquidationThreshold}
                onOverrideChange={(bps) =>
                  setField("eModeLiquidationThreshold", bps)
                }
              />
            </Group>
          )}

          <Group grow align="flex-start" mb="xs">
            <CapOverrideField
              label={t`Supply Cap`}
              description={t`0 means no cap`}
              originalCap={asset.supplyCap}
              overrideCap={override.supplyCap}
              onOverrideChange={(cap) => setField("supplyCap", cap)}
            />
          </Group>

          <FlagOverrideField
            label={t`Usable as Collateral`}
            description={t`When disabled, this asset stops counting toward borrowing power and health factor.`}
            originalValue={asset.usageAsCollateralEnabled}
            overrideValue={override.usageAsCollateralEnabled}
            onOverrideChange={(value) =>
              setField("usageAsCollateralEnabled", value)
            }
          />
        </>
      )}

      {assetType === "BORROW" && (
        <>
          <Group grow align="flex-start" mb="xs">
            <CapOverrideField
              label={t`Borrow Cap`}
              description={t`0 means no cap`}
              originalCap={asset.borrowCap}
              overrideCap={override.borrowCap}
              onOverrideChange={(cap) => setField("borrowCap", cap)}
            />
          </Group>

          <FlagOverrideField
            label={t`Borrowing Enabled`}
            description={t`When disabled, the asset can no longer be newly borrowed.`}
            originalValue={asset.borrowingEnabled}
            overrideValue={override.borrowingEnabled}
            onOverrideChange={(value) => setField("borrowingEnabled", value)}
          />
        </>
      )}

      <FlagOverrideField
        label={t`Frozen`}
        description={t`A frozen asset allows no new supplying or borrowing.`}
        originalValue={asset.isFrozen}
        overrideValue={override.isFrozen}
        onOverrideChange={(value) => setField("isFrozen", value)}
      />
      <FlagOverrideField
        label={t`Paused`}
        description={t`A paused asset allows no interactions at all.`}
        originalValue={asset.isPaused}
        overrideValue={override.isPaused}
        onOverrideChange={(value) => setField("isPaused", value)}
      />

      {hfDiffers && (
        <Text size="sm" ta="center" mt="md">
          <Trans>Health Factor</Trans>
          {": "}
          <Text span c="dimmed">
            {formatNumber(Math.max(hfOriginal || 0, 0), 2)} ➔{" "}
          </Text>
          <Mark color={getHealthFactorColor(hfCurrent || 0)}>
            <Text span pl="2px" pr="2px">
              {hfCurrent === Infinity
                ? "∞"
                : formatNumber(Math.max(hfCurrent || 0, 0), 2)}
            </Text>
          </Mark>
        </Text>
      )}
    </div>
  );
};

/**
 * Row-level entry point: a "tune" icon that opens the risk parameter editor
 * in a modal. Shows a yellow indicator when the asset has active overrides.
 */
type RiskParamsDialogProps = {
  assetSymbol: string;
  assetType: "RESERVE" | "BORROW";
};

export const RiskParamsDialog = ({
  assetSymbol,
  assetType,
}: RiskParamsDialogProps) => {
  const [open, setOpen] = React.useState(false);
  const { addressData, currentMarket, effectiveRiskOverrides } = useAaveData(
    "",
    true
  );

  const workingData = addressData?.[currentMarket]?.workingData;
  const item =
    assetType === "RESERVE"
      ? workingData?.userReservesData?.find(
        (r) => r.asset.symbol === assetSymbol
      )
      : workingData?.userBorrowsData?.find(
        (b) => b.asset.symbol === assetSymbol
      );

  if (!item) return null;

  const assetOverride = effectiveRiskOverrides?.assets?.[assetSymbol];
  const categoryId = item.asset.isEModeCollateral
    ? workingData?.userEmodeCategoryId
    : undefined;
  const categoryOverridden =
    categoryId !== undefined &&
    !!effectiveRiskOverrides?.eModeCategories?.[String(categoryId)];
  const hasOverride =
    (assetOverride && Object.keys(assetOverride).length > 0) ||
    categoryOverridden;

  const icon = (
    <ActionIcon>
      <TbAdjustmentsHorizontal
        title={t`Edit ${assetSymbol} Risk Parameters`}
        size={16}
        color={hasOverride ? "#FFFF00" : undefined}
        onClick={() => setOpen(true)}
      />
    </ActionIcon>
  );

  return (
    <>
      <Modal
        size="lg"
        opened={open}
        onClose={() => setOpen(false)}
        title={t`${assetSymbol} Risk Parameters`}
      >
        <RiskParamsEditor assetSymbol={assetSymbol} assetType={assetType} />
        <Group position="center" mt="lg">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t`Done`}
          </Button>
        </Group>
      </Modal>
      <Tooltip
        label={t`Edit ${assetSymbol} Risk Parameters`}
        position="right"
        withArrow
      >
        {hasOverride ? (
          <Indicator zIndex={3} color="#FFFF00" size={6}>
            {icon}
          </Indicator>
        ) : (
          icon
        )}
      </Tooltip>
    </>
  );
};

/**
 * Warning badge shown when the simulated position exceeds a (possibly
 * overridden) supply or borrow cap. Caps never change health-factor math;
 * they gate protocol actions, so surface them as warnings.
 */
type AssetCapWarningProps = {
  assetSymbol: string;
  assetType: "RESERVE" | "BORROW";
};

export const AssetCapWarning = ({
  assetSymbol,
  assetType,
}: AssetCapWarningProps) => {
  const { addressData, currentMarket, effectiveRiskOverrides } = useAaveData(
    "",
    true
  );

  const workingData = addressData?.[currentMarket]?.workingData;
  const override = effectiveRiskOverrides?.assets?.[assetSymbol];

  let quantity = 0;
  let cap: number | undefined;
  if (assetType === "RESERVE") {
    const item = workingData?.userReservesData?.find(
      (r) => r.asset.symbol === assetSymbol
    );
    if (!item) return null;
    quantity = item.underlyingBalance;
    cap = override?.supplyCap ?? item.asset.supplyCap;
  } else {
    const item = workingData?.userBorrowsData?.find(
      (b) => b.asset.symbol === assetSymbol
    );
    if (!item) return null;
    quantity = item.totalBorrows;
    cap = override?.borrowCap ?? item.asset.borrowCap;
  }

  if (!cap || cap <= 0 || quantity <= cap) return null;

  const label =
    assetType === "RESERVE"
      ? t`The simulated quantity (${formatNumber(
        quantity
      )}) exceeds the ${assetSymbol} supply cap (${formatNumber(cap)}).`
      : t`The simulated quantity (${formatNumber(
        quantity
      )}) exceeds the ${assetSymbol} borrow cap (${formatNumber(cap)}).`;

  return (
    <Tooltip label={label} withArrow multiline width={260}>
      <Badge
        color="yellow"
        variant="outline"
        size="sm"
        leftSection={<FiAlertTriangle size={10} />}
      >
        {assetType === "RESERVE" ? (
          <Trans>Exceeds supply cap</Trans>
        ) : (
          <Trans>Exceeds borrow cap</Trans>
        )}
      </Badge>
    </Tooltip>
  );
};

/**
 * Position-level indicator that risk parameter overrides are active.
 * Lists each override with its original value; offers clear-all.
 */
export const RiskOverridesChip = () => {
  const {
    addressData,
    currentMarket,
    effectiveRiskOverrides,
    riskOverrides,
    clearAllRiskOverrides,
  } = useAaveData("", true);

  const marketData = addressData?.[currentMarket];
  const entries = flattenRiskOverrides(effectiveRiskOverrides);

  if (!entries.length) return null;

  const knownAssets = getKnownAssets(marketData);
  const eModes = marketData?.workingData?.eModes as
    | EModeCategoryData[]
    | undefined;
  const hasManualOverrides = hasAnyRiskOverrides(riskOverrides);

  return (
    <Popover width="300px" position="bottom" withArrow shadow="md">
      <Popover.Target>
        <Tooltip
          label={t`Simulated risk parameter changes are active`}
          position="top-end"
          withArrow
        >
          <ActionIcon style={{ display: "inline-block" }}>
            <TbAdjustmentsHorizontal size={18} color="#FFFF00" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" fw={700} mb="xs">
          <Trans>Simulated Risk Parameters</Trans>
        </Text>
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
                : t`E-Mode: ${formatEModeLabel(category?.label) || entry.key}`;
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
        {hasManualOverrides && (
          <Group position="center" mt="sm">
            <Button
              variant="subtle"
              color="gray"
              compact
              onClick={clearAllRiskOverrides}
            >
              <Trans>Clear all risk parameter changes</Trans>
            </Button>
          </Group>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};
