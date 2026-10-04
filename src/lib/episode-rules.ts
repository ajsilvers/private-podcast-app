import { z } from "zod";
import { getContentType } from "@/lib/r2-content-type";

/** UTC-only ISO timestamp ("...Z"); null clears the date, undefined leaves it unchanged. */
export const ReleaseAtSchema = z.string().datetime({ offset: false }).nullable().optional();

type Existing = { publishedAt: Date | null; releaseAt: Date | null } | null;

/**
 * Derive publishedAt/releaseAt updates for an episode create or update.
 * publishedAt is stamped on first publication and kept afterwards.
 * A DATED show cannot publish an episode without a release date.
 */
export function publicationFields(input: {
  feedType: "BINGE" | "DRIP" | "DATED";
  existing: Existing;
  isPublished: boolean;
  releaseAt?: string | null;
  now?: Date;
}): { ok: true; data: { publishedAt?: Date; releaseAt?: Date | null } } | { ok: false; error: "release_date_required" } {
  const data: { publishedAt?: Date; releaseAt?: Date | null } = {};
  if (input.releaseAt !== undefined) data.releaseAt = input.releaseAt === null ? null : new Date(input.releaseAt);

  const effectiveReleaseAt = input.releaseAt !== undefined ? data.releaseAt : input.existing?.releaseAt ?? null;
  if (input.feedType === "DATED" && input.isPublished && !effectiveReleaseAt) {
    return { ok: false, error: "release_date_required" };
  }
  if (input.isPublished && !input.existing?.publishedAt) data.publishedAt = input.now ?? new Date();
  return { ok: true, data };
}

export function isAllowedAudio(filename: string): boolean {
  return getContentType(filename) === "audio/mpeg";
}

/** ISO UTC string → value for <input type="datetime-local"> shown as UTC. */
export function toUtcInputValue(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 16) : "";
}

/** <input type="datetime-local"> value, read as UTC → ISO string (or null when empty). */
export function fromUtcInputValue(value: string): string | null {
  return value ? `${value}:00.000Z` : null;
}

/** Display a UTC instant as "YYYY-MM-DD HH:MM UTC". */
export function formatUtc(iso: string | Date): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
