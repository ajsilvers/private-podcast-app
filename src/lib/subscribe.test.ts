import { describe, it, expect, beforeAll, beforeEach, inject } from "vitest";

describe("subscribe (real Postgres)", () => {
  let subscribe: typeof import("./subscribe").subscribe;
  let db: typeof import("./db").db;
  let showId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("testDatabaseUrl");
    // PGlite serves one connection at a time; a real Postgres URL can use the default pool.
    if (!process.env.TEST_DATABASE_URL) process.env.DATABASE_POOL_MAX = "1";
    process.env.SESSION_SECRET = "s".repeat(32);
    process.env.ADMIN_PASSWORD = "pw";
    process.env.NEXT_PUBLIC_APP_URL = "https://feeds.launchcastformula.com";
    ({ db } = await import("./db"));
    ({ subscribe } = await import("./subscribe"));
  });
  beforeEach(async () => {
    await db.subscriber.deleteMany();
    await db.show.deleteMany();
    const user = await db.user.upsert({ where: { email: "t@test.local" }, create: { email: "t@test.local" }, update: {} });
    showId = (
      await db.show.create({
        data: { userId: user.id, title: "T", authorName: "A", authorEmail: "a@x.co", slug: `t-${Date.now()}`, feedType: "DRIP", dripIntervalDays: 1 },
      })
    ).id;
  });

  it("normalizes email", async () => {
    const r = await subscribe({ showId, email: "  Jane@Example.COM " });
    expect(r.kind === "ok" && r.subscriber.email).toBe("jane@example.com");
  });
  it("returns same token on repeat and does not reset startDate", async () => {
    const a = await subscribe({ showId, email: "a@x.co" });
    const b = await subscribe({ showId, email: "A@X.co" });
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("expected ok");
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.subscriber.feedToken).toBe(a.subscriber.feedToken);
    expect(b.subscriber.startDate.toISOString()).toBe(a.subscriber.startDate.toISOString());
  });
  it("20 concurrent identical requests converge on one subscriber", async () => {
    const rs = await Promise.all(Array.from({ length: 20 }, () => subscribe({ showId, email: "race@x.co" })));
    const tokens = new Set(rs.map((r) => (r.kind === "ok" ? r.subscriber.feedToken : "x")));
    expect(tokens.size).toBe(1);
    expect(rs.filter((r) => r.kind === "ok" && r.created).length).toBe(1);
    expect(await db.subscriber.count({ where: { showId } })).toBe(1);
  });
  it("never reactivates a revoked subscriber", async () => {
    const a = await subscribe({ showId, email: "r@x.co" });
    if (a.kind !== "ok") throw new Error("expected ok");
    await db.subscriber.update({ where: { id: a.subscriber.id }, data: { status: "REVOKED" } });
    expect((await subscribe({ showId, email: "r@x.co" })).kind).toBe("revoked");
    expect((await db.subscriber.findUnique({ where: { id: a.subscriber.id } }))!.status).toBe("REVOKED");
  });
});
