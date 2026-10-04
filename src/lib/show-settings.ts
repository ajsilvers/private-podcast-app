import { z } from "zod";

const Base = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(4000).optional(),
  authorName: z.string().trim().min(1, "Author name is required").max(200),
  authorEmail: z.string().email("Valid email is required"),
  coverArtUrl: z.string().url().optional().or(z.literal("")),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens")
    .max(64),
  acceptingSubscribers: z.boolean().optional(),
  feedType: z.enum(["BINGE", "DRIP", "DATED"]),
  dripIntervalDays: z.number().int().min(1).max(30).optional(),
});

export const ShowSettingsSchema = Base;
export const ShowPatchSchema = Base.partial();

/** Fields that would change existing subscribers' schedules or break issued integrations. */
export const LOCKED_FIELDS = ["slug", "feedType", "dripIntervalDays"] as const;

export function lockedFieldViolations(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
  subscriberCount: number
): string[] {
  if (subscriberCount === 0) return [];
  return LOCKED_FIELDS.filter((field) => field in patch && patch[field] !== current[field]);
}

/** Lowercase, hyphenated, ASCII slug suggestion from a show title. */
export function suggestSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
}

/**
 * Episode numbers that would vanish from feeds if the show became DATED:
 * published, but with no release date (DATED never releases those).
 */
export function datedConversionBlockers(
  episodes: { episodeNumber: number; isPublished: boolean; releaseAt: Date | null }[]
): number[] {
  return episodes.filter((ep) => ep.isPublished && !ep.releaseAt).map((ep) => ep.episodeNumber);
}
