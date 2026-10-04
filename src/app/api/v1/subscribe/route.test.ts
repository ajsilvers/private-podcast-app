import { describe, it, expect, vi, beforeEach } from "vitest";

const { authenticateKey, subscribe, findUnique } = vi.hoisted(() => ({
  authenticateKey: vi.fn(),
  subscribe: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("@/lib/api-keys", () => ({ authenticateKey }));
vi.mock("@/lib/subscribe", () => ({ subscribe, feedUrl: (t: string) => `https://feeds.launchcastformula.com/api/feeds/${t}` }));
vi.mock("@/lib/db", () => ({ db: { show: { findUnique } } }));
import { POST } from "./route";

const call = (body: unknown, auth = "Bearer k") =>
  POST(
    new Request("https://x/api/v1/subscribe", {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
const show = { id: "s1", slug: "dbt", acceptingSubscribers: true };
const subscriber = { id: "u1", feedToken: "tok", startDate: new Date("2026-10-04T00:00:00Z") };

beforeEach(() => {
  vi.resetAllMocks();
  authenticateKey.mockResolvedValue({ id: "k", showIds: ["s1"] });
  findUnique.mockResolvedValue(show);
});

describe("POST /api/v1/subscribe", () => {
  it("201 with feed_url for a new subscriber", async () => {
    subscribe.mockResolvedValue({ kind: "ok", created: true, subscriber });
    const res = await call({ feed: "dbt", email: "a@x.co", first_name: "Jane" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      feed_url: "https://feeds.launchcastformula.com/api/feeds/tok",
      created: true,
      feed: "dbt",
      status: "active",
    });
    expect(subscribe).toHaveBeenCalledWith({ showId: "s1", email: "a@x.co", name: "Jane", externalRef: null });
  });
  it("200 on repeat", async () => {
    subscribe.mockResolvedValue({ kind: "ok", created: false, subscriber });
    expect((await call({ feed: "dbt", email: "a@x.co" })).status).toBe(200);
  });
  it("401 without valid key", async () => {
    authenticateKey.mockResolvedValue(null);
    expect((await call({ feed: "dbt", email: "a@x.co" }, "")).status).toBe(401);
  });
  it("rejects feed outside key scope with 404 and creates nothing", async () => {
    findUnique.mockResolvedValue({ ...show, id: "other" });
    expect((await call({ feed: "dbt", email: "a@x.co" })).status).toBe(404);
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("403 when feed closed", async () => {
    findUnique.mockResolvedValue({ ...show, acceptingSubscribers: false });
    expect((await call({ feed: "dbt", email: "a@x.co" })).status).toBe(403);
  });
  it("409 revoked, no URL", async () => {
    subscribe.mockResolvedValue({ kind: "revoked" });
    const res = await call({ feed: "dbt", email: "a@x.co" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("feeds/");
  });
  it("400 on malformed JSON, unknown fields, or bad email", async () => {
    expect((await call("{not json")).status).toBe(400);
    expect((await call({ feed: "dbt", email: "nope" })).status).toBe(400);
    expect((await call({ feed: "dbt", email: "a@x.co", start_date: "2020-01-01" })).status).toBe(400);
  });
  it("413 on oversized body", async () => {
    expect((await call({ feed: "dbt", email: "a@x.co", name: "x".repeat(9000) })).status).toBe(413);
  });
});
