import { describe, it, expect, vi, beforeEach } from "vitest";

const { authenticateKey, subscribe } = vi.hoisted(() => ({ authenticateKey: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/lib/api-keys", () => ({ authenticateKey }));
vi.mock("@/lib/subscribe", () => ({ subscribe, feedUrl: (t: string) => `https://f/api/feeds/${t}` }));
vi.mock("@/lib/db", () => ({ db: { subscriber: { findMany: vi.fn().mockResolvedValue([]) } } }));
import { POST } from "./route";

const ctx = { params: Promise.resolve({ showId: "s1" }) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (body: string) => POST(new Request("https://x", { method: "POST", headers: { authorization: "Bearer k" }, body }) as any, ctx);

beforeEach(() => {
  vi.resetAllMocks();
  authenticateKey.mockResolvedValue({ id: "k", showIds: ["s1"] });
});

describe("legacy POST /api/v1/shows/:showId/subscribers", () => {
  it("does not reactivate revoked subscribers", async () => {
    subscribe.mockResolvedValue({ kind: "revoked" });
    expect((await call(JSON.stringify({ email: "a@x.co" }))).status).toBe(409);
  });
  it("rejects shows outside the key's scope", async () => {
    authenticateKey.mockResolvedValue({ id: "k", showIds: ["other"] });
    expect((await call(JSON.stringify({ email: "a@x.co" }))).status).toBe(404);
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("400 on malformed JSON", async () => {
    expect((await call("{bad")).status).toBe(400);
  });
  it("keeps the legacy response shape", async () => {
    subscribe.mockResolvedValue({ kind: "ok", created: true, subscriber: { id: "u1", email: "a@x.co", name: null, feedToken: "t", startDate: new Date(0), activatedAt: null } });
    const res = await call(JSON.stringify({ email: "a@x.co" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "u1", email: "a@x.co", name: null, feed_url: "https://f/api/feeds/t", status: "active", start_date: new Date(0).toISOString(), activated: false });
  });
});
