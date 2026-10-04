import { describe, it, expect } from "vitest";
import { ShowSettingsSchema, ShowPatchSchema, lockedFieldViolations } from "./show-settings";

const ok = { title: "T", authorName: "A", authorEmail: "a@x.co", slug: "dbt-audio-series", feedType: "BINGE" };

describe("ShowSettingsSchema", () => {
  it("accepts binge", () => expect(ShowSettingsSchema.safeParse(ok).success).toBe(true));
  it("rejects bad slug", () => expect(ShowSettingsSchema.safeParse({ ...ok, slug: "Has Space" }).success).toBe(false));
  it("accepts DATED with no interval", () => {
    expect(ShowSettingsSchema.safeParse({ ...ok, feedType: "DATED" }).success).toBe(true);
  });
  it("rejects unknown mode", () => expect(ShowSettingsSchema.safeParse({ ...ok, feedType: "SCHEDULED" }).success).toBe(false));
  it("patch keeps omitted fields omitted", () => {
    const r = ShowPatchSchema.safeParse({ title: "New" });
    expect(r.success && Object.keys(r.data)).toEqual(["title"]);
  });
});

describe("lockedFieldViolations", () => {
  it("allows any change with zero subscribers", () => {
    expect(lockedFieldViolations({ feedType: "DRIP" }, { feedType: "BINGE" }, 0)).toEqual([]);
  });
  it("rejects changing cadence once subscribed, allows unchanged values", () => {
    expect(lockedFieldViolations({ feedType: "DRIP", title: "x" }, { feedType: "BINGE" }, 3)).toEqual(["feedType"]);
    expect(lockedFieldViolations({ feedType: "BINGE" }, { feedType: "BINGE" }, 3)).toEqual([]);
  });
});

describe("suggestSlug", () => {
  it("produces a valid slug from a title", async () => {
    const { suggestSlug } = await import("./show-settings");
    expect(suggestSlug("  The Done-by-Three Audio Series! ")).toBe("the-done-by-three-audio-series");
    expect(suggestSlug("Café & Crème")).toBe("cafe-creme");
    expect(ShowSettingsSchema.shape.slug.safeParse(suggestSlug("A".repeat(100))).success).toBe(true);
  });
});

describe("datedConversionBlockers", () => {
  it("lists published episodes without a release date", async () => {
    const { datedConversionBlockers } = await import("./show-settings");
    const t = new Date("2026-11-01T09:00:00Z");
    expect(
      datedConversionBlockers([
        { episodeNumber: 1, isPublished: true, releaseAt: t },
        { episodeNumber: 2, isPublished: true, releaseAt: null },
        { episodeNumber: 3, isPublished: false, releaseAt: null },
      ])
    ).toEqual([2]);
  });
});
