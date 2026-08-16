import { render } from "@testing-library/react";

import { AssetSlider } from "../../components/assets/AssetSlider";

type NoUiSliderElement = HTMLDivElement & {
  noUiSlider?: { get: () => number | string | (number | string)[] };
};

const sliderValue = (container: HTMLElement) => {
  const node = container.firstElementChild as NoUiSliderElement | null;
  const raw = node?.noUiSlider?.get();
  const first = Array.isArray(raw) ? raw[0] : raw;
  return Number(first);
};

describe("AssetSlider", () => {
  it("recenters on the original price after an external change is reset", () => {
    const onChange = jest.fn();
    const { rerender, container } = render(
      <AssetSlider defaultValue={100} onChange={onChange} />,
    );

    expect(sliderValue(container)).toBe(100);

    // Liquidation scenario (or any parent-driven price) moves the slider.
    rerender(<AssetSlider defaultValue={40} onChange={onChange} />);
    expect(sliderValue(container)).toBe(40);

    // Reset all changes must rebuild around the original price, not stay
    // parked on the scenario price.
    rerender(<AssetSlider defaultValue={100} onChange={onChange} />);
    expect(sliderValue(container)).toBe(100);
  });
});
