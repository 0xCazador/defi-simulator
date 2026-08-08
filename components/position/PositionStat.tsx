import { ReactNode } from "react";
import { Popover, Text } from "@mantine/core";

import classes from "./Position.module.css";

type PositionStatProps = {
  /** Stat label (pass the existing <Trans> node so message IDs are stable) */
  label: ReactNode;
  /** Popover body explaining the stat (existing <Trans> node) */
  description: ReactNode;
  /** Original (pre-simulation) value, shown dimmed when `differs` */
  original?: ReactNode;
  /** Whether the simulated value differs from the original */
  differs?: boolean;
  /** Optional element rendered between the label and the values (e.g. a Progress meter) */
  meter?: ReactNode;
  /** Current value */
  children: ReactNode;
};

/**
 * A single stat in the position summary: a dotted-underline label that opens
 * an explainer popover, an optional dimmed "original ➔" line when the
 * simulation has changed the value, and the current value. The original line
 * always occupies space so rows don't jump when a simulation kicks in.
 */
export const PositionStat = ({
  label,
  description,
  original,
  differs = false,
  meter,
  children,
}: PositionStatProps) => (
  <div style={{ textAlign: "center" }}>
    <Popover width="250px" withArrow shadow="md">
      <Popover.Target>
        <Text fz="xs" span className={classes.statLabel}>
          {label}
        </Text>
      </Popover.Target>
      <Popover.Dropdown>{description}</Popover.Dropdown>
    </Popover>

    {meter}

    <Text
      fz="xs"
      c="dimmed"
      className={classes.statValue}
      style={{ visibility: differs ? "visible" : "hidden" }}
      aria-hidden={!differs}
    >
      {original} ➔
    </Text>
    <Text span fw={700} fz="md" className={classes.statValue}>
      {children}
    </Text>
  </div>
);

export default PositionStat;
