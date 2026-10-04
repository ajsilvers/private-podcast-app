import { describe, it, expect } from "vitest";
import { episodeReleaseAt, isReleased, type ScheduleSettings } from "./release-schedule";

const drip: ScheduleSettings = { feedType: "DRIP", dripIntervalDays: 1 };
const start = new Date("2026-10-04T23:50:00Z");
const H = 3600_000;
const ep = (n: number, releaseAt: Date | null = null) => ({ episodeNumber: n, releaseAt });

describe("BINGE", () => {
  it("releases every episode at start", () => {
    expect(episodeReleaseAt(ep(9), { feedType: "BINGE", dripIntervalDays: null }, start)).toEqual(start);
  });
});

describe("DRIP (elapsed interval)", () => {
  it("ep1 immediately, ep2 exactly 24h later, not at midnight", () => {
    expect(isReleased(ep(1), drip, start, start)).toBe(true);
    expect(isReleased(ep(2), drip, start, new Date(start.getTime() + 20 * 60_000))).toBe(false);
    expect(isReleased(ep(2), drip, start, new Date(start.getTime() + 24 * H - 1))).toBe(false);
    expect(isReleased(ep(2), drip, start, new Date(start.getTime() + 24 * H))).toBe(true);
  });
  it("interval 7 → ep3 at +14 days", () => {
    expect(episodeReleaseAt(ep(3), { feedType: "DRIP", dripIntervalDays: 7 }, start)!.getTime() - start.getTime()).toBe(14 * 24 * H);
  });
  it("TZ independence: result identical regardless of process TZ", () => {
    const before = episodeReleaseAt(ep(2), drip, start)!.toISOString();
    process.env.TZ = "Pacific/Kiritimati";
    expect(episodeReleaseAt(ep(2), drip, start)!.toISOString()).toBe(before);
    process.env.TZ = "UTC";
  });
});

describe("DATED (fixed UTC date per episode)", () => {
  const dated: ScheduleSettings = { feedType: "DATED", dripIntervalDays: null };
  const at = new Date("2026-11-01T09:00:00Z");
  it("DATED boundary: hidden 1ms before, visible at the instant", () => {
    expect(isReleased(ep(1, at), dated, start, new Date(at.getTime() - 1))).toBe(false);
    expect(isReleased(ep(1, at), dated, start, at)).toBe(true);
  });
  it("ignores signup time: late joiner sees already-released episodes", () => {
    const late = new Date("2026-12-01T00:00:00Z");
    expect(isReleased(ep(1, at), dated, late, late)).toBe(true);
    expect(episodeReleaseAt(ep(1, at), dated, late)).toEqual(at);
  });
  it("episode without a date is never released", () => {
    expect(episodeReleaseAt(ep(2, null), dated, start)).toBeNull();
    expect(isReleased(ep(2, null), dated, start, new Date("2099-01-01T00:00:00Z"))).toBe(false);
  });
});
