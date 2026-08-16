import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import ViewTabs from "../../components/ViewTabs";

const ADDRESS = "0x34aa3f359a9d614239015126635ce7732c18fdf3";

const mockRouter = {
  pathname: "/",
  query: { address: ADDRESS } as Record<string, string>,
};

jest.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string | { pathname: string; query?: Record<string, string> };
    children: React.ReactNode;
    className?: string;
  }) => {
    const url =
      typeof href === "string"
        ? href
        : `${href.pathname}${
            href.query ? `?${new URLSearchParams(href.query).toString()}` : ""
          }`;
    return (
      <a href={url} className={className} {...rest}>
        {children}
      </a>
    );
  },
}));

jest.mock("@lingui/core/macro", () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    typeof strings === "string"
      ? strings
      : strings.reduce(
          (acc, part, index) => acc + part + String(values[index] ?? ""),
          "",
        ),
}));
jest.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderTabs = () => {
  i18n.load("en", {});
  i18n.activate("en");
  return render(
    <I18nProvider i18n={i18n}>
      <MantineProvider>
        <ViewTabs />
      </MantineProvider>
    </I18nProvider>,
  );
};

describe("ViewTabs", () => {
  beforeEach(() => {
    mockRouter.pathname = "/";
    mockRouter.query = { address: ADDRESS };
  });

  it("renders both views as real links that keep the address query", () => {
    renderTabs();
    const simulator = screen.getByRole("link", { name: /simulator/i });
    const interest = screen.getByRole("link", { name: /interest/i });

    expect(simulator.tagName).toBe("A");
    expect(interest.tagName).toBe("A");
    expect(simulator.getAttribute("href")).toContain(ADDRESS);
    expect(interest.getAttribute("href")).toContain(ADDRESS);
    expect(interest.getAttribute("href")).toContain("/interest");
  });

  it("marks the active view with aria-current", () => {
    const { rerender } = renderTabs();
    expect(screen.getByRole("link", { name: /simulator/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /interest/i })).not.toHaveAttribute(
      "aria-current",
    );

    mockRouter.pathname = "/interest";
    rerender(
      <I18nProvider i18n={i18n}>
        <MantineProvider>
          <ViewTabs />
        </MantineProvider>
      </I18nProvider>,
    );

    expect(screen.getByRole("link", { name: /interest/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: /simulator/i }),
    ).not.toHaveAttribute("aria-current");
  });

  it("exposes a named navigation landmark", () => {
    renderTabs();
    expect(screen.getByRole("navigation", { name: "Page views" })).toBeTruthy();
  });
});
