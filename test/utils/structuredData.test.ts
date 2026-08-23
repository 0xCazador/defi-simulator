import { setupI18n } from "@lingui/core";

// The Babel-free jest transform doesn't expand Lingui macros; mirror the repo
// convention and mock both the tagged and bound t(i18n)`...` forms.
jest.mock("@lingui/core/macro", () => ({
  t: (first: unknown, ...rest: unknown[]) => {
    const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (acc, part, index) => acc + part + String(values[index] ?? ""),
        "",
      );
    if (Array.isArray(first))
      return interpolate(first as unknown as TemplateStringsArray, ...rest);
    return interpolate;
  },
}));

import { getSeoContent } from "../../utils/seoContent";
import {
  buildStructuredData,
  serializeStructuredData,
} from "../../utils/structuredData";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

type Graph = { "@context": string; "@graph": Record<string, any>[] };

const graphFor = (route: "/" | "/interest", locale = "en") =>
  buildStructuredData(route, locale, getSeoContent(route, i18n)) as Graph;

const typeIn = (graph: Graph, type: string) =>
  graph["@graph"].find((node) => node["@type"] === type);

describe("buildStructuredData", () => {
  it("uses a single @graph rooted at schema.org", () => {
    const graph = graphFor("/");
    expect(graph["@context"]).toBe("https://schema.org");
    expect(Array.isArray(graph["@graph"])).toBe(true);
  });

  it("describes the tool as a free web application", () => {
    const app = typeIn(graphFor("/"), "WebApplication");
    expect(app?.applicationCategory).toBe("FinanceApplication");
    expect(app?.isAccessibleForFree).toBe(true);
    expect(app?.offers).toMatchObject({ price: "0" });
    expect(app?.url).toBe("https://defisim.xyz/");
  });

  it("wires the app and FAQ to one Organization by @id", () => {
    const graph = graphFor("/");
    const organization = typeIn(graph, "Organization");
    const app = typeIn(graph, "WebApplication");
    expect(organization?.["@id"]).toBe("https://defisim.xyz/#organization");
    expect(app?.publisher).toEqual({ "@id": organization?.["@id"] });
  });

  it("mirrors the visible FAQ copy question for question", () => {
    // FAQPage markup that doesn't match the rendered page is a manual-action
    // risk, so the two must come from the same source.
    const content = getSeoContent("/interest", i18n);
    const faq = typeIn(graphFor("/interest"), "FAQPage");
    expect(faq?.mainEntity).toHaveLength(content.faq.length);
    content.faq.forEach((entry, index) => {
      expect(faq?.mainEntity[index].name).toBe(entry.question);
      expect(faq?.mainEntity[index].acceptedAnswer.text).toBe(entry.answer);
    });
  });

  it("breadcrumbs /interest back to the root but gives the root none", () => {
    expect(typeIn(graphFor("/"), "BreadcrumbList")).toBeUndefined();
    const crumbs = typeIn(graphFor("/interest"), "BreadcrumbList");
    expect(crumbs?.itemListElement).toHaveLength(2);
    expect(crumbs?.itemListElement[0].item).toBe("https://defisim.xyz/");
    expect(crumbs?.itemListElement[1].item).toBe(
      "https://defisim.xyz/interest",
    );
  });

  it("carries the locale through and localizes the canonical", () => {
    const graph = graphFor("/interest", "de");
    expect(typeIn(graph, "WebApplication")?.inLanguage).toBe("de");
    expect(typeIn(graph, "WebApplication")?.url).toBe(
      "https://defisim.xyz/de/interest",
    );
  });

  it("claims no ratings", () => {
    const app = typeIn(graphFor("/"), "WebApplication");
    expect(app?.aggregateRating).toBeUndefined();
    expect(app?.review).toBeUndefined();
  });
});

describe("serializeStructuredData", () => {
  it("escapes < so a translated string can't close the script tag", () => {
    const serialized = serializeStructuredData({
      name: "</script><img onerror=alert(1)>",
    });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script");
  });

  it("produces parseable JSON for both routes", () => {
    (["/", "/interest"] as const).forEach((route) => {
      const serialized = serializeStructuredData(graphFor(route));
      expect(() =>
        JSON.parse(serialized.replace(/\\u003c/g, "<")),
      ).not.toThrow();
    });
  });
});
