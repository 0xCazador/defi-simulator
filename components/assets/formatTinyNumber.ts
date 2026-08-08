// Avoid exponential notation for very small numbers
export const ensureTinyNumberFormatting = (num: number) => {
  if (!num || num > 0.000001) return num;
  const decimalsPart = num?.toString()?.split(".")?.[1] || "";
  const eDecimals = Number(decimalsPart?.split("e-")?.[1]) || 0;
  const countOfDecimals = decimalsPart.length + eDecimals;
  return Number(num).toFixed(countOfDecimals);
};

export default ensureTinyNumberFormatting;
