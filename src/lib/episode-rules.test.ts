import { describe, it, expect } from "vitest";
import { publicationFields, ReleaseAtSchema, isAllowedAudio } from "./episode-rules";

const t = new Date("2026-11-01T09:00:00Z");

describe("publicationFields", () => {
  it("sets publishedAt on first publish only", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    expect(publicationFields({ feedType: "BINGE", existing: null, isPublished: true, now })).toEqual({ ok: true, data: { publishedAt: now } });
    expect(publicationFields({ feedType: "BINGE", existing: { publishedAt: t, releaseAt: null }, isPublished: true, now })).toEqual({ ok: true, data: {} });
  });
  it("DATED: publishing without a release date is rejected", () => {
    expect(publicationFields({ feedType: "DATED", existing: null, isPublished: true })).toEqual({ ok: false, error: "release_date_required" });
    expect(publicationFields({ feedType: "DATED", existing: { publishedAt: null, releaseAt: t }, isPublished: true, releaseAt: null }))
      .toEqual({ ok: false, error: "release_date_required" });
  });
  it("DATED: keeps existing date when releaseAt omitted, accepts a new one", () => {
    const now = new Date();
    expect(publicationFields({ feedType: "DATED", existing: { publishedAt: null, releaseAt: t }, isPublished: true, now }))
      .toEqual({ ok: true, data: { publishedAt: now } });
    expect(publicationFields({ feedType: "DATED", existing: null, isPublished: false, releaseAt: "2026-12-01T08:30:00.000Z" }))
      .toEqual({ ok: true, data: { releaseAt: new Date("2026-12-01T08:30:00.000Z") } });
  });
});

describe("ReleaseAtSchema", () => {
  it("accepts only UTC Z timestamps", () => {
    expect(ReleaseAtSchema.safeParse("2026-12-01T08:30:00.000Z").success).toBe(true);
    expect(ReleaseAtSchema.safeParse("2026-12-01T08:30:00+01:00").success).toBe(false);
    expect(ReleaseAtSchema.safeParse(null).success).toBe(true);
  });
});

describe("isAllowedAudio", () => {
  it("allows mp3 only", () => {
    expect(isAllowedAudio("ep.MP3")).toBe(true);
    expect(isAllowedAudio("ep.m4a")).toBe(false);
    expect(isAllowedAudio("ep.wav")).toBe(false);
  });
});

describe("UTC datetime-local helpers", () => {
  it("round-trips without applying the browser timezone", async () => {
    const { toUtcInputValue, fromUtcInputValue } = await import("./episode-rules");
    process.env.TZ = "America/Los_Angeles";
    expect(toUtcInputValue("2026-12-01T08:30:00.000Z")).toBe("2026-12-01T08:30");
    expect(fromUtcInputValue("2026-12-01T08:30")).toBe("2026-12-01T08:30:00.000Z");
    expect(toUtcInputValue(null)).toBe("");
    expect(fromUtcInputValue("")).toBeNull();
    process.env.TZ = "UTC";
  });
});
