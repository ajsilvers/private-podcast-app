import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { generateFeed } from "./feed-generator";

/* eslint-disable @typescript-eslint/no-explicit-any */
const show: any = {
  id: "s1", slug: "demo", title: "Tips & <Tricks>", description: "A ]]> B", authorName: "AJ", authorEmail: "aj@example.com",
  coverArtUrl: "https://media.launchcastformula.com/c.jpg", feedType: "DRIP", dripIntervalDays: 1,
  episodes: [1, 2, 3].map((n) => ({
    id: `e${n}`, title: `Ep ${n} & more`, description: `desc ]]> ${n}`, audioUrl: `https://media.launchcastformula.com/a${n}.mp3?x=1&y=2`,
    imageUrl: null, durationSeconds: 61, fileSizeBytes: 1000, episodeNumber: n, seasonNumber: null,
    isPublished: n !== 2, releaseAt: null, publishedAt: new Date("2026-09-01T00:00:00Z"), createdAt: new Date("2026-08-01T00:00:00Z"),
  })),
};
const sub: any = { id: "u1", feedToken: "tok", startDate: new Date("2026-10-01T10:00:00Z") };
const parse = (x: string) => new XMLParser({ ignoreAttributes: false }).parse(x);
const items = (x: string) => [parse(x).rss.channel.item ?? []].flat();

describe("generateFeed", () => {
  it("parses with hostile metadata and escapes enclosure URLs", () => {
    const xml = generateFeed(show, sub, "https://feeds.launchcastformula.com", new Date("2026-10-10T00:00:00Z"));
    const ch = parse(xml).rss.channel;
    expect(ch.title).toBe("Tips & <Tricks>");
    expect(ch.link).toBe("https://feeds.launchcastformula.com");
    expect(ch["itunes:type"]).toBe("serial");
    expect(items(xml)[0].enclosure["@_url"]).toBe("https://media.launchcastformula.com/a1.mp3?x=1&y=2");
    expect(items(xml)[0].description).toContain("]]>");
  });
  it("drafts are hidden and do not pull later episodes forward", () => {
    const xml = generateFeed(show, sub, "https://x", new Date("2026-10-02T10:00:00Z")); // ep3 due 10-03
    expect(items(xml).map((i: any) => i["itunes:episode"])).toEqual([1]);
  });
  it("drip pubDate equals release time", () => {
    const xml = generateFeed(show, sub, "https://x", new Date("2026-10-10T00:00:00Z"));
    const ep3 = items(xml).find((i: any) => i["itunes:episode"] === 3);
    expect(new Date(ep3.pubDate).toISOString()).toBe("2026-10-03T10:00:00.000Z");
  });
  it("binge shows all published with stable publishedAt dates, never in the future", () => {
    const now = new Date("2026-10-01T10:00:01Z");
    const xml = generateFeed({ ...show, feedType: "BINGE" }, sub, "https://x", now);
    const its = items(xml);
    expect(its.map((i: any) => i["itunes:episode"])).toEqual([1, 3]);
    for (const i of its) expect(new Date(i.pubDate).getTime()).toBeLessThanOrEqual(now.getTime());
  });
  it("dated show lists only episodes whose UTC date has passed, pubDate = releaseAt", () => {
    const dated = { ...show, feedType: "DATED", episodes: show.episodes.map((e: any) => ({ ...e, isPublished: true,
      releaseAt: new Date(`2026-11-0${e.episodeNumber}T09:00:00Z`) })) };
    const xml = generateFeed(dated, sub, "https://x", new Date("2026-11-02T09:00:00Z"));
    const its = items(xml);
    expect(its.map((i: any) => i["itunes:episode"])).toEqual([1, 2]);
    expect(new Date(its[1].pubDate).toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });
  it("future start date shows nothing", () => {
    const xml = generateFeed({ ...show, feedType: "BINGE" }, sub, "https://x", new Date("2026-09-30T00:00:00Z"));
    expect(items(xml)).toEqual([]);
  });
});
