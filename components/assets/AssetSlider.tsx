import { useEffect, useRef, useState } from "react";
import noUiSlider, { API as NoUiSliderAPI } from "nouislider";

type AssetSliderProps = {
  defaultValue: number;
  onChange: (value: number) => void;
};

type NoUiSliderElement = HTMLDivElement & { noUiSlider?: NoUiSliderAPI };

/**
 * Non-linear slider for simulating quantity/price changes.
 *
 * Kept on noUiSlider rather than Mantine Slider: the piecewise range below
 * gives progressively finer resolution toward the center (±2% of the value
 * across the middle fifth of the track) while still reaching 0 and 20x at the
 * edges, and re-centers on the new value after each drag. Mantine's Slider is
 * linear in value space (its `scale` prop only transforms labels), so it
 * can't express this without reimplementing the mapping. noUiSlider handles
 * are keyboard-operable and expose the slider ARIA role out of the box.
 */
export const AssetSlider = ({ defaultValue, onChange }: AssetSliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const divRef = useRef<NoUiSliderElement>(null);

  useEffect(() => {
    // initialize the slider
    if (divRef.current?.noUiSlider) return; // already initialized
    createSlider();
  }, []);

  useEffect(() => {
    // handle external reset or change
    if (
      !isDragging &&
      value != null &&
      defaultValue != null &&
      defaultValue !== value
    ) {
      createSlider();
    }
  }, [defaultValue, value, isDragging]);

  const createSlider = () => {
    const node = divRef.current;
    if (!node) return;
    if (node.noUiSlider) {
      node.noUiSlider.destroy();
      delete node.noUiSlider;
    }

    // Non-linear track centered on the current value, with progressively
    // finer resolution toward the middle: the inner 20% of the track spans
    // only ±2% of the value (a pixel of movement ≈ 0.05–0.1%), the next band
    // spans ±20%, and the edges still reach 0 and 20x for big swings. The
    // slider re-centers on the new value after each drag, so repeated small
    // adjustments stay precise.
    const pivot = (multiplier: number) =>
      [Math.max(defaultValue * multiplier, multiplier)] as [number];

    const slider = noUiSlider.create(node, {
      start: [defaultValue],
      range: {
        min: [0],
        "8%": pivot(0.25),
        "25%": pivot(0.8),
        "40%": pivot(0.98),
        "50%": pivot(1),
        "60%": pivot(1.02),
        "75%": pivot(1.2),
        "92%": pivot(2),
        max: pivot(20),
      },
      // Arrow keys move by (segment span / keyboardDefaultStep); with the
      // ±2% center segments this is 0.1% of the value per keypress.
      keyboardDefaultStep: 20,
      // Default format rounds to 2 decimals, which would cap precision for
      // small values (e.g. sub-dollar prices); pass raw numbers through.
      format: {
        to: (v: number) => v,
        from: (v: string) => Number(v),
      },
    });

    slider.on("slide", handleChange);
    slider.on("start", () => setIsDragging(true));
    slider.on("end", () => setIsDragging(false));
  };

  const handleChange = (val: (number | string)[]) => {
    const raw = Number(val[0]); // noUiSlider emits formatted strings
    // Round relative to magnitude (5 significant digits ≈ 0.01% granularity)
    // rather than fixed absolute steps, so the ultra-fine center-zone moves
    // register even on large prices/quantities.
    const rounded =
      Number.isFinite(raw) && raw > 0 ? Number(raw.toPrecision(5)) : 0;
    onChange(rounded);
    setValue(rounded);
  };

  return <div ref={divRef} />;
};

export default AssetSlider;
