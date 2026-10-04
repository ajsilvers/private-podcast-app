import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** New integration key. `raw` is shown to the admin once; only `hash` is stored. */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `lcf_live_${nanoid(32)}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashApiKey(raw) };
}

export function parseBearer(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Resolve a Bearer header to an active key and the shows it may subscribe to.
 * Lookup is by SHA-256 hash on a unique index; the caller never controls the stored value.
 */
export async function authenticateKey(header: string | null): Promise<{ id: string; showIds: string[] } | null> {
  const raw = parseBearer(header);
  if (!raw) return null;
  const key = await db.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) }, include: { shows: true } });
  if (!key || key.revokedAt) return null;
  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: key.id, showIds: key.shows.map((s) => s.showId) };
}
