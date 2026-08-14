import { ReactNode } from "react";
import { t, Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import {
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { AiTwotoneExperiment } from "react-icons/ai";
import { FaHistory } from "react-icons/fa";

import { useAaveData } from "../hooks/useAaveData";
import { useAccruedInterest } from "../hooks/useAccruedInterest";
import { AccrualSide } from "../pages/api/aave/accrual";
import { formatTokenAmount } from "../utils/formatTokenAmount";
import LocalizedFiatDisplay from "./LocalizedFiatDisplay";
import classes from "./AccruedInterestStat.module.css";

/** Shared surface for the cells of the modal's Interest Information row */
export const AssetStatCard = ({ children }: { children: ReactNode }) => (
  <Paper withBorder p="sm" className={classes.card}>
    <Center h="100%">{children}</Center>
  </Paper>
);

type AccruedInterestStatProps = {
  side: AccrualSide;
  /** underlying asset symbol, e.g. WBTC */
  symbol: string | undefined;
  priceInUSD: number | undefined;
  /** aToken address when supplying, variable debt token address when borrowing */
  tokenAddress: string | undefined;
  /** address as entered (may be an ENS name); used to read the current market */
  address: string;
  /** resolved on-chain address whose token events are read */
  resolvedAddress: string;
  onViewHistory: () => void;
};

/**
 * Total interest accrued by one position, reconstructed from on-chain token
 * events, with a link through to the full per-transaction history.
 */
export const AccruedInterestStat = ({
  side,
  symbol,
  priceInUSD,
  tokenAddress,
  address,
  resolvedAddress,
  onViewHistory,
}: AccruedInterestStatProps) => {
  const { i18n } = useLingui();
  const { currentMarket } = useAaveData(address, true);
  const accrual = useAccruedInterest(
    currentMarket,
    resolvedAddress,
    tokenAddress,
    side
  );

  const accruedValue: number = Number(accrual.accruedValue ?? "0");

  // The accrual math over token events is exact, so a negative value indicates a
  // token with non-standard accounting (e.g. GHO's discounted debt) or an RPC
  // inconsistency; hide the value rather than display a wrong number.
  const isInvalidValue: boolean =
    !symbol ||
    !!accrual.fetchError?.length ||
    accrual.accruedValue === undefined ||
    accruedValue < 0;

  const description: string =
    side === "supply"
      ? t`Experimental. The Accrued Interest refers to the total interest accrued by this supplied asset since it was first supplied in the current market by the user. This feature is experimental, there may be miscalculations, or it may not be available for all assets.`
      : t`Experimental. The Accrued Interest refers to the total interest accrued by this borrowed asset since it was first borrowed in the current market by the user. This feature is experimental, there may be miscalculations, or it may not be available for all assets.`;

  const sinceDate: string = accrual.sinceTimestamp
    ? i18n.date(new Date(accrual.sinceTimestamp * 1000), {
        dateStyle: "medium",
      })
    : "";

  return (
    <Stack gap={8} align="center">
      <Group gap={4} justify="center" wrap="nowrap">
        <Tooltip label={t`Experimental Feature`} position="top" withArrow>
          <Text span c="blue" fz="xs" lh={1}>
            <AiTwotoneExperiment />
          </Text>
        </Tooltip>
        <Popover width="250px" withArrow shadow="md">
          <Popover.Target>
            <Text span fz="xs" className={classes.label}>
              <Trans>Accrued Interest:</Trans>
            </Text>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">{description}</Text>
          </Popover.Dropdown>
        </Popover>
      </Group>

      {/* Reserving the height keeps the card from jumping when the value
          replaces the loader, and centers the loader while it spins. */}
      <Center mih={42}>
        {accrual.isFetching ? (
          <Loader type="dots" color="gray" size="sm" />
        ) : isInvalidValue ? (
          <Text fz="sm" c="dimmed">
            <Trans>Unavailable</Trans>
          </Text>
        ) : (
          <Stack gap={2} align="center">
            <Text
              className={`${classes.amount} ${
                side === "supply" ? classes.earned : classes.paid
              }`}
            >
              {`${formatTokenAmount(accruedValue, i18n.locale)} ${symbol}`}
            </Text>
            <Text fz="xs" c="dimmed">
              <LocalizedFiatDisplay
                valueUSD={accruedValue * (priceInUSD ?? 0)}
              />
              {!!sinceDate.length && (
                <>
                  {" · "}
                  <Trans>since {sinceDate}</Trans>
                </>
              )}
            </Text>
          </Stack>
        )}
      </Center>

      <Button
        size="compact-xs"
        variant="light"
        leftSection={<FaHistory size={11} />}
        onClick={onViewHistory}
      >
        <Trans>View full interest history</Trans>
      </Button>
    </Stack>
  );
};

export default AccruedInterestStat;
