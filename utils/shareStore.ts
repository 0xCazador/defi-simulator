/**
 * Snapshot store for share cards: Netlify Blobs in production, a local
 * filesystem fallback in development (so `npm run dev` works without the
 * Netlify CLI). Blob content is write-once — a given ID never changes, which
 * is what makes the immutable CDN caching on /s/{id} and /api/og safe.
 *
 * IDs are 10 chars of base58 from crypto-random bytes: unguessable, which is
 * the integrity model — snapshots are server-minted and only readable by ID.
 */
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { SharePayload, validateSharePayload } from "./shareCard";

const STORE_NAME = "shares";
const ID_LENGTH = 10;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const LOCAL_DIR = path.join(
  process.cwd(),
  ".netlify",
  "blobs-local",
  STORE_NAME,
);

export const isValidShareId = (id: unknown): id is string =>
  typeof id === "string" &&
  id.length === ID_LENGTH &&
  [...id].every((char) => BASE58.includes(char));

const newShareId = (): string =>
  Array.from(randomBytes(ID_LENGTH), (byte) => BASE58[byte % 58]).join("");

/** Netlify Blobs store, or null when the Netlify environment isn't present
 * (local dev without `netlify dev`). Dynamic import keeps the ESM-only SDK
 * out of client bundles and out of Jest's module graph. */
const getBlobStore = async () => {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE_NAME);
    return store;
  } catch {
    return null;
  }
};

/**
 * Persist a validated payload under a fresh ID. Throws on storage failure —
 * the mint endpoint translates that into the inline-URL fallback signal.
 */
export const putShare = async (payload: SharePayload): Promise<string> => {
  const clean = validateSharePayload(payload);
  if (!clean) throw new Error("Invalid share payload.");
  const id = newShareId();
  const store = await getBlobStore();
  if (store) {
    await store.setJSON(id, clean);
    return id;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, `${id}.json`), JSON.stringify(clean));
  return id;
};

/** Fetch + re-validate a stored payload. Null for unknown/invalid IDs. */
export const getShare = async (id: unknown): Promise<SharePayload | null> => {
  if (!isValidShareId(id)) return null;
  try {
    const store = await getBlobStore();
    if (store) {
      const raw = await store.get(id, { type: "json" });
      return validateSharePayload(raw);
    }
    const file = await fs.readFile(path.join(LOCAL_DIR, `${id}.json`), "utf8");
    return validateSharePayload(JSON.parse(file));
  } catch {
    return null;
  }
};
