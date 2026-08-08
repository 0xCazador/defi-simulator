import {
  ActionIcon,
  Modal,
  Paper,
  Tooltip,
  createTheme,
  type MantineColorsTuple,
} from "@mantine/core";

/**
 * Design tokens for the DeFi Simulator web3 dark theme.
 *
 * The app is dark-only (forceColorScheme="dark" in _app.tsx), so the dark
 * scale below is effectively the whole surface system:
 *
 *   dark-0..2  text (bright -> dimmed)
 *   dark-4     borders
 *   dark-5     hover states
 *   dark-6     raised surfaces (cards, inputs, menus)
 *   dark-7     page background
 *   dark-8..9  recessed surfaces (wells, sticky headers)
 */

/** Blue-slate charcoal replacing Mantine's neutral dark scale. */
const dark: MantineColorsTuple = [
  "#e8eef7", // 0 – primary text
  "#c4cfe0", // 1
  "#96a3b8", // 2 – dimmed text
  "#6a7789", // 3
  "#3b4658", // 4 – borders
  "#2a3344", // 5 – hover
  "#1d2432", // 6 – raised surface
  "#131a25", // 7 – page background
  "#0d131c", // 8 – recessed surface
  "#080c12", // 9 – deepest
];

/**
 * Electric azure brand scale. Blue is the one accent family that stays clear
 * of the semantics already in use: green/yellow/red for health factor and
 * amber for changed values.
 */
const brand: MantineColorsTuple = [
  "#e8f1ff",
  "#cfe1ff",
  "#a6c8ff",
  "#79abff",
  "#4d8dff",
  "#2f74f5",
  "#1f5fe0",
  "#164cbd",
  "#113c99",
  "#0d2f78",
];

/** Health-factor semantics: safe. Teal-leaning green that reads on dark. */
const hfSafe: MantineColorsTuple = [
  "#e6fcf5",
  "#c3fae8",
  "#96f2d7",
  "#63e6be",
  "#38d9a9",
  "#20c997",
  "#12b886",
  "#0ca678",
  "#099268",
  "#087f5b",
];

export const theme = createTheme({
  // Preserves the v6-era pixel breakpoints (576/768/992/1200) as em values.
  breakpoints: {
    xs: "0em",
    sm: "36em",
    md: "48em",
    lg: "62em",
    xl: "75em",
  },

  colors: {
    dark,
    brand,
    // getHealthFactorColor() returns "green" | "yellow" | "red"; point
    // "green" at the teal-leaning safe scale so HF colors match the theme.
    green: hfSafe,
  },

  primaryColor: "brand",
  primaryShade: { light: 6, dark: 5 },

  defaultGradient: { from: "brand.4", to: "cyan.4", deg: 45 },

  defaultRadius: "md",

  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: {
    fontFamily:
      "'Space Grotesk', Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: "600",
  },

  components: {
    // The app's icon buttons were designed around the quiet v6 look.
    ActionIcon: ActionIcon.extend({
      defaultProps: { variant: "subtle", color: "gray" },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "md" },
    }),
    Modal: Modal.extend({
      defaultProps: {
        radius: "lg",
        overlayProps: { backgroundOpacity: 0.6, blur: 4 },
      },
    }),
    Tooltip: Tooltip.extend({
      defaultProps: { radius: "md" },
    }),
  },

  other: {
    // Accent used to flag values the user has changed in the simulation.
    simChanged: "#fcc419",
  },
});

export default theme;
