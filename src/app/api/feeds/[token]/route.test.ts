import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    subscriber: { findUnique: vi.fn(), update: vi.fn() },
    feedRequest: { create: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://feeds.launchcastformula.com" }) }));
import { GET, HEAD } from "./route";

const sub = {
  id: "u1", status: "ACTIVE", activatedAt: null, feedToken: "tok", startDate: new Date(0),
  show: { feedType: "BINGE", title: "T", authorName: "A", authorEmail: "a@x.co", episodes: [] },
};
const ctx = { params: Promise.resolve({ token: "tok" }) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (method = "GET") => new Request("https://x/api/feeds/tok", { method }) as any;

beforeEach(() => vi.resetAllMocks());

describe("feed route", () => {
  it("serves RSS even when analytics writes fail", async () => {
    db.subscriber.findUnique.mockResolvedValue(sub);
    db.feedRequest.create.mockRejectedValue(new Error("db down"));
    db.subscriber.update.mockRejectedValue(new Error("db down"));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
  });
  it("404s revoked tokens", async () => {
    db.subscriber.findUnique.mockResolvedValue({ ...sub, status: "REVOKED" });
    expect((await GET(req(), ctx)).status).toBe(404);
  });
  it("HEAD returns headers without logging or activation", async () => {
    db.subscriber.findUnique.mockResolvedValue(sub);
    const res = await HEAD(req("HEAD"), ctx);
    expect(res.status).toBe(200);
    expect(db.feedRequest.create).not.toHaveBeenCalled();
    expect(db.subscriber.update).not.toHaveBeenCalled();
  });
});
