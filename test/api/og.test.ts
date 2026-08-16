/**
 * @jest-environment node
 *
 * OG image endpoint contract tests: valid snapshots return PNGs of the
 * expected dimensions with the right cache headers, every template fully
 * evaluates (all satori components execute), and every failure path still
 * returns HTTP 200 with a PNG (crawlers must never see a broken image).
 *
 * The real satori/resvg renderer can't run inside Jest's vm (its wasm is
 * resolved via import.meta / dynamic import), so ImageResponse is faked:
 * the fake force-evaluates the entire element tree — any exception in a
 * template surfaces as a test failure — and emits a PNG header matching the
 * requested dimensions. Real end-to-end rasterization is covered by the
 * dev-server checks in the verification pass.
 */
import type { NextApiRequest, NextApiResponse } from "next";

jest.mock("next/og", () => {
  /** Recursively execute the satori element tree (function components and
   * children) so template bugs throw here, exactly as satori would. */
  const evaluate = (node: any): void => {
    if (node === null || node === undefined || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(evaluate);
      return;
    }
    if (typeof node.type === "function") {
      evaluate(node.type(node.props ?? {}));
      return;
    }
    evaluate(node.props?.children);
  };

  /** Minimal PNG (signature + IHDR) carrying the requested dimensions. */
  const fakePng = (width: number, height: number): Buffer => {
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write("IHDR", 4);
    ihdr.writeUInt32BE(width, 8);
    ihdr.writeUInt32BE(height, 12);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ihdr,
    ]);
  };

  class FakeImageResponse {
    private readonly png: Buffer;

    constructor(
      element: any,
      options: { width: number; height: number; fonts?: unknown[] },
    ) {
      if (!options?.fonts?.length) {
        throw new Error("ImageResponse invoked without fonts");
      }
      evaluate(element);
      this.png = fakePng(options.width, options.height);
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      return this.png.buffer.slice(
        this.png.byteOffset,
        this.png.byteOffset + this.png.byteLength,
      ) as ArrayBuffer;
    }
  }

  return { ImageResponse: FakeImageResponse };
});

// The SWC jest transformer doesn't expand Lingui macros; mock both plain
// t`...` and the bound t(i18n)`...` form (see test/utils/shareCard.test.ts).
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

import handler from "../../pages/api/og/[[...slug]]";
import shareHandler from "../../pages/api/share";
import { encodeInlineCard, SharePayload } from "../../utils/shareCard";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

type MockRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
};

const invokeOg = async (slug?: string[]): Promise<MockRes> => {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end(payload: any) {
      this.body = payload;
    },
    json(payload: any) {
      this.body = payload;
    },
    send(payload: any) {
      this.body = payload;
    },
  };
  await handler(
    { query: { slug }, headers: {} } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  return res;
};

/** Path segments as the app builds them: /api/og/{tv}/{locale}/{kind}/{v}.png */
const ogSlug = (kind: "id" | "c" | "a", value: string, locale = "en") => [
  "1",
  locale,
  kind,
  `${value}.png`,
];

/** Read PNG dimensions straight from the IHDR chunk. */
const pngSize = (buffer: Buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});

const liqPayload: SharePayload = {
  card: {
    v: 1,
    k: "liq",
    a: "0x1111111111111111111111111111111111111111",
    m: "ETHEREUM_V3",
    mt: "Ethereum v3",
    ni: "ethereum",
    asOf: 1_750_000_000,
    hf: 1.24,
    sim: true,
    drops: [
      { s: "WBTC", from: 65_000, to: 41_200, pct: -36.6 },
      { s: "WETH", from: 3_200, to: 1_850, pct: -42.2 },
    ],
  },
};

const expectFullSizePng = (res: MockRes) => {
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toBe("image/png");
  const buffer = res.body as Buffer;
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(pngSize(buffer)).toEqual({ width: 1200, height: 630 });
};

describe("/api/og", () => {
  jest.setTimeout(30_000);

  it("renders the branded default card with immutable caching", async () => {
    const res = await invokeOg(undefined);
    expectFullSizePng(res);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("renders a liquidation card from an inline payload", async () => {
    const res = await invokeOg(ogSlug("c", encodeInlineCard(liqPayload.card)));
    expectFullSizePng(res);
  });

  it("renders an interest card from an inline payload", async () => {
    const payload: SharePayload = {
      card: {
        v: 1,
        k: "interest",
        a: "stani.eth",
        m: "ETHEREUM_V3",
        mt: "Ethereum v3",
        ni: "ethereum",
        asOf: 1_750_000_000,
        net: 12_482,
        earned: 15_000,
        paid: 2_518,
        since: 1_704_067_200,
        top: [
          ["USDC", 9_000],
          ["WETH", 4_000],
        ],
      },
    };
    const res = await invokeOg(ogSlug("c", encodeInlineCard(payload.card)));
    expectFullSizePng(res);
  });

  it("renders a position card from a stored snapshot id", async () => {
    const payload: SharePayload = {
      card: {
        v: 1,
        k: "position",
        a: "0x2222222222222222222222222222222222222222",
        m: "ETHEREUM_V3",
        mt: "Ethereum v3",
        ni: "ethereum",
        asOf: 1_750_000_000,
        hf: 1.84,
        sim: false,
        borrowedUSD: 500_000,
        availableUSD: 2_100_000,
        suppliedUSD: 3_000_000,
        netUSD: 2_500_000,
      },
    };
    // Mint through the real share endpoint (local filesystem store in tests).
    const mintRes: any = {
      statusCode: 0,
      body: null,
      setHeader() {},
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: any) {
        this.body = value;
      },
      send(value: any) {
        this.body = value;
      },
    };
    await shareHandler(
      {
        method: "POST",
        headers: {},
        body: payload,
        query: {},
      } as unknown as NextApiRequest,
      mintRes,
    );
    expect(mintRes.statusCode).toBe(200);
    expect(mintRes.body.id).toBeTruthy();

    const res = await invokeOg(ogSlug("id", mintRes.body.id));
    expectFullSizePng(res);
  });

  it("falls back to the default card for unknown ids (never 500)", async () => {
    const res = await invokeOg(ogSlug("id", "zzzzzzzzzz"));
    expectFullSizePng(res);
  });

  it("falls back to the default card for corrupt inline payloads", async () => {
    const res = await invokeOg(ogSlug("c", "!!!corrupt!!!"));
    expectFullSizePng(res);
  });

  it("falls back to the default card for malformed paths", async () => {
    const res = await invokeOg(["1", "en", "bogus"]);
    expectFullSizePng(res);
  });

  it("renders the address-only variant for pasted URLs", async () => {
    const res = await invokeOg(ogSlug("a", "stani.eth"));
    expectFullSizePng(res);
  });

  it("ignores hostile address input on the address-only variant", async () => {
    const res = await invokeOg(
      ogSlug("a", encodeURIComponent("<script>alert(1)</script>")),
    );
    expectFullSizePng(res);
  });

  it("renders localized cards for a non-default locale", async () => {
    const res = await invokeOg(
      ogSlug("c", encodeInlineCard(liqPayload.card), "es"),
    );
    expectFullSizePng(res);
  });
});
