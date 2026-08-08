/**
 * Locale-aware display formatting for token quantities, tiered so both whale-sized
 * and dust-sized amounts stay readable:
 *
 *   0            -> "0"
 *   < 1          -> 3 significant digits   ("0.00042")
 *   < 100,000    -> grouped, 2 decimals    ("94,762.25")
 *   >= 100,000   -> compact, 2 decimals    ("644.82K", "1.2M")
 *
 * Pass `compact: false` where the exact magnitude matters more than brevity
 * (e.g. a "reset to this value" affordance), which keeps large amounts grouped
 * in full ("644,815.30") instead of abbreviating them.
 */
type FormatTokenAmountOptions = {
  compact?: boolean;
};

export const formatTokenAmount = (
  value: number,
  locale: string = "en",
  { compact = true }: FormatTokenAmountOptions = {}
): string => {
  if (!Number.isFinite(value) || value === 0) return "0";

  const abs = Math.abs(value);

  if (abs < 1) {
    return new Intl.NumberFormat(locale, {
      maximumSignificantDigits: 3,
    }).format(value);
  }
  if (abs < 100_000 || !compact) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};
