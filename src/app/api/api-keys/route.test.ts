import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, isAuthenticated } = vi.hoisted(() => ({
  db: { apiKey: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() }, show: { count: vi.fn() } },
  isAuthenticated: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ isAuthenticated }));
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = (body: unknown) => POST(new Request("https://x/api/api-keys", { method: "POST", body: JSON.stringify(body) }) as any);

beforeEach(() => {
  vi.resetAllMocks();
  isAuthenticated.mockResolvedValue(true);
});

describe("api-keys admin routes", () => {
  it("rejects unauthenticated access", async () => {
    isAuthenticated.mockResolvedValue(false);
    expect((await GET()).status).toBe(401);
    expect((await post({ name: "x", showIds: ["s1"] })).status).toBe(401);
  });
  it("creates a scoped key, returns the raw key once and stores only its hash", async () => {
    db.show.count.mockResolvedValue(1);
    db.apiKey.create.mockImplementation(async ({ data }) => ({ id: "k1", ...data }));
    const res = await post({ name: "donebythree.com", showIds: ["s1"] });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.raw).toMatch(/^lcf_live_/);
    const stored = db.apiKey.create.mock.calls[0][0].data;
    expect(stored.keyHash).not.toBe(json.raw);
    expect(JSON.stringify(stored)).not.toContain(json.raw);
    expect(stored.shows).toEqual({ create: [{ showId: "s1" }] });
  });
  it("rejects unknown show ids", async () => {
    db.show.count.mockResolvedValue(0);
    expect((await post({ name: "x", showIds: ["nope"] })).status).toBe(400);
  });
  it("list never includes the hash", async () => {
    db.apiKey.findMany.mockResolvedValue([]);
    await GET();
    expect(db.apiKey.findMany.mock.calls[0][0].select.keyHash).toBeUndefined();
  });
  it("revoke sets revokedAt", async () => {
    db.apiKey.update.mockResolvedValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await DELETE(new Request("https://x", { method: "DELETE" }) as any, { params: Promise.resolve({ id: "k1" }) });
    expect(res.status).toBe(200);
    expect(db.apiKey.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });
});
