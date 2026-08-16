import type { NextApiRequest, NextApiResponse } from "next";

import { validateSharePayload } from "../../utils/shareCard";
import { putShare } from "../../utils/shareStore";

const allowedMethods = ["POST", "OPTIONS"];

/** Reject cross-site mints; the ShareButton always posts same-origin. */
const isSameOrigin = (req: NextApiRequest): boolean => {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches may omit the header
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
};

/**
 * Mint a share snapshot: validate, store in Netlify Blobs, return the ID.
 * On storage failure returns `{ id: null }` so the client falls back to the
 * long inline-payload URL — a Blobs outage degrades URLs, never sharing.
 */
const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      res.status(405).send({ message: "Method not allowed." });
      return;
    }
    if (!isSameOrigin(_req)) {
      res.status(403).json({ message: "Forbidden." });
      return;
    }
    const body =
      typeof _req.body === "string" ? JSON.parse(_req.body) : _req.body;
    const payload = validateSharePayload(body);
    if (!payload) {
      res.status(400).json({ message: "Invalid share payload." });
      return;
    }
    try {
      const id = await putShare(payload);
      res.status(200).json({ id });
    } catch (err) {
      console.error("Share mint failed, client will fall back inline:", err);
      res.status(200).json({ id: null });
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export default handler;
