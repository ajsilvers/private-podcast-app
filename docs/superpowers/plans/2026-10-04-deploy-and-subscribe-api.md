# Deploy + Subscribe API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the private-podcast app live on a `launchcastformula.com` subdomain and add a server-to-server subscribe API: a site sends `{feed, email, first_name?}` and gets back that person's private feed URL, with the feed's own settings (binge / interval drip / fixed UTC release dates per episode) controlling release.

**Architecture:** Keep the existing single-admin Next.js 16 app. Deploy it to Vercel (Node runtime) with Neon Postgres and Cloudflare R2 for media. Add a `slug` to each show so callers pick a feed by a stable public key, scoped integration API keys (hashed, per-site, limited to listed feeds), a pure `release-schedule` module that owns all timing, and a single `subscribe` service used by both the new endpoint and the legacy v1 route. Release eligibility is still computed at feed-fetch time, so no cron or background worker is needed.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, Prisma 7.4 + `@prisma/adapter-pg`, Neon Postgres, Zod 4, iron-session, Cloudflare R2 (S3 SDK), Vitest, `fast-xml-parser` (tests only), Vercel.

**Spec:** AJ's request of 2026-10-04 (this conversation), read with `docs/REVIEW-2026-09-17.md` and `docs/IMPLEMENTATION-PLAN.md`. **This plan supersedes those documents where they conflict:**
- Email delivery moves to the calling site. The app returns `feed_url` to the authenticated caller, and the site sends it through its own ESP (e.g. Bento). The Resend outbox, delivery jobs, cron worker and provider callbacks in the Sept 17 plan are **out of scope**.
- The caller picks the feed by request parameter (`feed` = show slug). The key that caller uses must be allowed for that feed. The show still owns the cadence.
- The hostname is a `launchcastformula.com` subdomain. This plan proposes `feeds.launchcastformula.com` for the app and `media.launchcastformula.com` for R2.
- AJ 2026-10-04: the third mode is **date-specific**. The admin sets one UTC date/time per episode, the same for every subscriber. No timezone handling.
- AJ 2026-10-04: the site may **email and display** `feed_url` (e.g. in a modal). It is not treated as sensitive; wrong-address signups are handled by manually revoking.
- The website-side changes (Done by Three, ajsilvers.com) are separate follow-up plans. This plan delivers the API and a documented integration contract.

## Global Constraints

- Feed URLs are permanent once issued: `https://<APP_HOST>/api/feeds/{token}`. Never change the path or rotate tokens on re-subscribe.
- Timing is in UTC instants, entered and displayed as UTC in the admin (labelled "UTC"). Server timezone must never affect release (tests run under two TZs).
- Interval drip keeps AJ's confirmed rule: `releaseAt = startDate + (N-1) × interval`, measured as exact elapsed time, not calendar midnight.
- Emails are stored trimmed + lowercased.
- A revoked subscriber is never reactivated by any API call. Only the dashboard can reactivate.
- The request body never decides cadence, start date, show id or feed type. Only `feed` (slug), `email`, `first_name`, `name` and `external_id` are accepted.
- API keys are stored hashed (SHA-256), shown once when created, and never logged or rendered again.
- Production fails closed if `SESSION_SECRET` (≥32 chars), `ADMIN_PASSWORD`, `DATABASE_URL` or `NEXT_PUBLIC_APP_URL` is missing.
- Tests never use the local `.env` database. DB tests use `TEST_DATABASE_URL` (a throwaway Neon branch) and skip when it is unset.
- No push, deploy, DNS change, paid plan or provisioning without AJ's go-ahead at Task 9.
- Commit format (OS convention): `[type] Brief description`, where type is add/update/fix/remove/refactor.

## Hosting decision (part a)

| | Vercel (recommended) | Railway |
|---|---|---|
| Fit | Native Next.js 16 host. Every request in this app is short: RSS, JSON API, presign. Audio goes directly from R2 to clients. | Runs `next start` as a long-lived container. Good for persistent workers and an in-house Postgres. |
| Background work | **None needed.** Drip is evaluated on fetch, and email now belongs to the caller. | Its advantage, persistent workers, is no longer used. |
| DB | Neon pooled endpoint over `pg`, with a small pool (`max: 5`) under Fluid compute. | Railway Postgres in the same project, one bill. |
| Cost/plan | Commercial use needs **Pro** (Hobby is non-commercial only). Team `ajsilvers-projects` exists; I haven't checked its plan tier. | Usage-based (~$5 base + usage). No commercial restriction. |
| Ops history | AJ already runs Vercel projects (`aix-insight-private-pod`, Ship It). Vercel MCP and CLI are wired up here. | Used before, but no active tooling here. |

**Decision: Vercel + Neon + R2.** The email outbox was the one thing that favoured Railway, and AJ's new design removes it. Fall back to Railway only if AJ won't pay for Vercel Pro. The code stays portable either way: no Vercel-only APIs, and `next start` works unchanged.

DNS: `feeds.launchcastformula.com` → CNAME `cname.vercel-dns.com`. `media.launchcastformula.com` → R2 custom domain. That domain must be on Cloudflare DNS, or have a CNAME set up per Cloudflare's partial-setup rules. Where `launchcastformula.com` DNS is hosted is **unknown** and gets checked in Task 9.

## API contract (part b)

```
POST https://feeds.launchcastformula.com/api/v1/subscribe
Authorization: Bearer lcf_live_<random>
Content-Type: application/json

{ "feed": "dbt-audio-series", "email": "Jane@Example.com ", "first_name": "Jane", "external_id": "optional-site-event-id" }
```

| Result | Status | Body |
|---|---|---|
| New subscriber | 201 | `{ "feed_url", "subscriber_id", "feed": "<slug>", "status": "active", "created": true, "start_date" }` |
| Already subscribed (same email + feed) | 200 | same shape, `created: false`, **same token and start_date** |
| Revoked subscriber | 409 | `{ "error": "subscriber_revoked" }`, no URL |
| Bad/missing key | 401 | `{ "error": "unauthorized" }` |
| Key not allowed for this feed, or unknown feed | 404 | `{ "error": "feed_not_found" }` (same response so feeds can't be enumerated) |
| Feed not accepting subscribers (`acceptingSubscribers=false`) | 403 | `{ "error": "feed_closed" }` |
| Invalid JSON / fields | 400 | `{ "error": "invalid_request", "issues": [...] }` |
| Body > 8 KB | 413 | `{ "error": "payload_too_large" }` |

Display note for callers: the site may email `feed_url` and show it in its confirmation modal (AJ's decision). Someone entering another person's address gets that person's feed, which is acceptable; the remedy is revoking that subscriber in the dashboard. Revocation makes the URL 404 immediately.

## Release modes (show settings)

| Mode (`FeedType`) | Settings | Rule |
|---|---|---|
| `BINGE` | none | Every published episode is visible as soon as `startDate` has passed. pubDate = `episode.publishedAt`. |
| `DRIP` (interval) | `dripIntervalDays` (1–30) | Episode N releases at `startDate + (N-1)·D·24h`. "Daily drip" is D=1. |
| `DATED` (date-specific) | per-episode `Episode.releaseAt` (UTC, required to publish) | Episode visible to every active subscriber once `now ≥ releaseAt`, regardless of signup time; late joiners see everything already released. pubDate = `releaseAt`. Same calendar for everyone. |

For DRIP, episode N means its `episodeNumber`; unpublished slots keep their delay, so a draft ep2 does not pull ep3 forward. Once a show has any subscriber, `feedType`, `dripIntervalDays` and `slug` are locked (API returns 409); a new cadence means a new show. In a DATED show, episode `releaseAt` stays editable after launch because it moves the date for everyone equally (no per-subscriber drift). A DATED episode without `releaseAt` cannot be published.

## Review Focus

1. **Same person submits twice (or the site retries after a timeout):** the same feed URL comes back, with no new token and no reset start date. Owned by Task 7 (`returns same token on repeat` + concurrent test).
2. **Mixed-case or space-padded email (`" Jane@Example.COM"`):** treated as the same subscriber as `jane@example.com`. Owned by Task 7 (`normalizes email`).
3. **Signup at 23:50 under any server TZ; DATED episode at an exact UTC instant:** no early release; `releaseAt` 2026-11-01T09:00Z is hidden at 08:59:59Z and visible at 09:00:00Z under any `TZ`. Owned by Task 3 (`TZ independence`, `DATED boundary`).
4. **Episode titles/descriptions with `&`, `<`, `]]>` and audio URLs with query strings:** the feed still parses in podcast apps. Owned by Task 4 (`parses with hostile metadata`).
5. **Key for site A used to subscribe someone to site B's feed:** 404, and nothing is created. Owned by Task 7 (`rejects feed outside key scope`).

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (new) | Test runner config, `@/` alias |
| `src/lib/env.ts` (new) | Fail-closed env validation |
| `src/lib/auth.ts` (modify) | Remove known-secret fallback |
| `prisma/schema.prisma` + migration (modify/new) | slug, DATED mode, Episode.releaseAt, publishedAt, ApiKey, normalized email |
| `src/lib/release-schedule.ts` (new) | Pure: `releaseAt(episodeNumber, show, startDate)` and `isReleased` |
| `src/lib/feed-generator.ts` (modify) | RSS built from release-schedule, XML-safe |
| `src/app/api/feeds/[token]/route.ts` (modify) | Best-effort analytics, HEAD, start-date gate |
| `src/lib/api-keys.ts` (new) | Generate/hash/verify scoped keys |
| `src/app/api/api-keys/route.ts`, `src/app/api/api-keys/[id]/route.ts` (new) | Admin create/list/revoke |
| `src/app/(dashboard)/settings/page.tsx` (modify) | Key management UI; stop printing raw key |
| `src/lib/show-settings.ts` (new) | Zod schema for show create/patch, cadence lock |
| `src/app/api/shows/route.ts`, `[id]/route.ts`, `src/components/forms/show-form.tsx` (modify) | Slug + mode fields + lock |
| `src/lib/subscribe.ts` (new) | Normalize, concurrency-safe upsert, no reactivation |
| `src/app/api/v1/subscribe/route.ts` (new) | The public server-to-server endpoint |
| `src/app/api/v1/shows/[showId]/subscribers/route.ts` (modify) | Use subscribe service; stop auto-reactivating |
| `docs/API.md`, `docs/DEPLOYMENT.md` (new) | Caller contract + runbook |
| `vercel.json` (new), `package.json` (modify) | Region, build w/ prisma generate, engines |

---

### Task 1: Test harness and fail-closed runtime

**Files:**
- Modify: `package.json`, `src/lib/auth.ts:8`, `eslint.config.mjs`, `src/app/(dashboard)/layout.tsx` (the `<a>` lint error)
- Create: `vitest.config.ts`, `src/lib/env.ts`, `src/lib/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): { DATABASE_URL: string; SESSION_SECRET: string; ADMIN_PASSWORD: string; APP_URL: string }`, which throws `Error("Missing or invalid env: <NAMES>")`. `npm test` runs Vitest.

- [ ] **Step 1: Install tooling**

```bash
cd /Users/main/Work/code/private-podcast
npm i -D vitest fast-xml-parser
```

- [ ] **Step 2: Add config and scripts**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`package.json` scripts and engines:
```json
"scripts": {
  "dev": "next dev",
  "build": "prisma generate && next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "postinstall": "prisma generate"
},
"engines": { "node": ">=22 <25" }
```

- [ ] **Step 3: Write failing test** `src/lib/env.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const good = {
  DATABASE_URL: "postgresql://u:p@h/db",
  SESSION_SECRET: "x".repeat(32),
  ADMIN_PASSWORD: "pw",
  NEXT_PUBLIC_APP_URL: "https://feeds.launchcastformula.com",
};

describe("parseEnv", () => {
  it("accepts a complete env and strips trailing slash", () => {
    expect(parseEnv({ ...good, NEXT_PUBLIC_APP_URL: good.NEXT_PUBLIC_APP_URL + "/" }).APP_URL)
      .toBe("https://feeds.launchcastformula.com");
  });
  it("rejects short or missing session secret", () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    const { SESSION_SECRET, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/SESSION_SECRET/);
  });
  it("rejects the old hard-coded fallback secret", () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: "complex_password_at_least_32_characters_long" }))
      .toThrow(/SESSION_SECRET/);
  });
  it("rejects non-URL app url", () => {
    expect(() => parseEnv({ ...good, NEXT_PUBLIC_APP_URL: "feeds" })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
```

- [ ] **Step 4: Run `npx vitest run src/lib/env.test.ts`.** Expected: FAIL, `Cannot find module './env'`.

- [ ] **Step 5: Implement** `src/lib/env.ts`

```ts
import { z } from "zod";

const KNOWN_BAD = "complex_password_at_least_32_characters_long";

const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32).refine((s) => s !== KNOWN_BAD),
  ADMIN_PASSWORD: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export function parseEnv(src: Record<string, string | undefined>) {
  const r = Schema.safeParse(src);
  if (!r.success) {
    const names = [...new Set(r.error.issues.map((i) => String(i.path[0])))].join(", ");
    throw new Error(`Missing or invalid env: ${names}`);
  }
  return {
    DATABASE_URL: r.data.DATABASE_URL,
    SESSION_SECRET: r.data.SESSION_SECRET,
    ADMIN_PASSWORD: r.data.ADMIN_PASSWORD,
    APP_URL: r.data.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""),
  };
}

let cached: ReturnType<typeof parseEnv> | undefined;
export function getEnv() {
  return (cached ??= parseEnv(process.env));
}
```

In `src/lib/auth.ts` replace the password line:
```ts
import { getEnv } from "@/lib/env";
// ...
export const sessionOptions: SessionOptions = {
  get password() { return getEnv().SESSION_SECRET; },
  cookieName: "ppa_session",
  // cookieOptions unchanged
} as SessionOptions;
```
and in `login()` use `getEnv().ADMIN_PASSWORD` compared with `crypto.timingSafeEqual` on equal-length SHA-256 digests:
```ts
import { createHash, timingSafeEqual } from "node:crypto";
const h = (s: string) => createHash("sha256").update(s).digest();
export async function login(password: string): Promise<boolean> {
  return timingSafeEqual(h(password), h(getEnv().ADMIN_PASSWORD));
}
```

In `src/lib/db.ts` bound the pool: `new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 })`.

- [ ] **Step 6: Fix lint.** Add `{ ignores: [".claude/**", "graft/**"] }` to `eslint.config.mjs`, and replace the dashboard `<a href>` flagged by `npm run lint` with `next/link` `<Link>`.

- [ ] **Step 7: Verify.** `npx vitest run` → PASS. `npm run lint` → 0 errors. `npx tsc --noEmit` → clean. `npm run build`, using dummy env values exported in the shell (not `.env`), → succeeds.

- [ ] **Step 8: Commit** `git add -A package.json package-lock.json vitest.config.ts src/lib eslint.config.mjs "src/app/(dashboard)/layout.tsx" && git commit -m "[add] Test harness, fail-closed env and session secret"`

---

### Task 2: Schema for slugs, schedule modes, publishedAt, scoped keys

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261004000000_subscribe_api/migration.sql` (generated, then reviewed)

**Interfaces:**
- Produces: `Show.slug: string (unique)`, `Show.acceptingSubscribers: boolean`, `FeedType` = `BINGE | DRIP | DATED`, `Episode.releaseAt: Date|null` (UTC), `Episode.publishedAt: Date|null`, `ApiKey { id, name, prefix, keyHash, revokedAt, lastUsedAt, shows: ApiKeyShow[] }`, `ApiKeyShow { apiKeyId, showId }`, `Subscriber.externalRef: string|null`.

- [ ] **Step 1: Edit schema.** Add to `enum FeedType`: `DATED`. Add to `Show`:

```prisma
  slug                  String    @unique
  acceptingSubscribers  Boolean   @default(true) @map("accepting_subscribers")
  apiKeys               ApiKeyShow[]
```
Add to `Episode`: `publishedAt DateTime? @map("published_at")` and `releaseAt DateTime? @map("release_at") // DATED shows: UTC release instant`, plus `@@index([showId, releaseAt])`. Add to `Subscriber`: `externalRef String? @map("external_ref")`. New models:

```prisma
model ApiKey {
  id         String       @id @default(cuid())
  name       String
  prefix     String                          // first 12 chars, for display
  keyHash    String       @unique @map("key_hash")
  createdAt  DateTime     @default(now()) @map("created_at")
  lastUsedAt DateTime?    @map("last_used_at")
  revokedAt  DateTime?    @map("revoked_at")
  shows      ApiKeyShow[]
  @@map("api_keys")
}

model ApiKeyShow {
  apiKeyId String @map("api_key_id")
  showId   String @map("show_id")
  apiKey   ApiKey @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)
  show     Show   @relation(fields: [showId], references: [id], onDelete: Cascade)
  @@id([apiKeyId, showId])
  @@map("api_key_shows")
}
```

- [ ] **Step 2: Generate migration without applying.** `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > prisma/migrations/20261004000000_subscribe_api/migration.sql`

- [ ] **Step 3: Hand-edit the SQL so it is safe on existing rows.** `slug` must be backfilled before `NOT NULL` + unique, and existing published episodes need a `publishedAt`. Emails need normalizing, with a collision preflight:

```sql
ALTER TABLE "shows" ADD COLUMN "slug" TEXT;
UPDATE "shows" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "shows" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "shows_slug_key" ON "shows"("slug");
-- (keep generated statements for the other columns/tables)
UPDATE "episodes" SET "published_at" = "created_at" WHERE "is_published" AND "published_at" IS NULL;
-- Abort if normalizing would merge two subscribers:
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM subscribers GROUP BY show_id, lower(trim(email)) HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'email normalization collision; reconcile manually'; END IF;
END $$;
UPDATE "subscribers" SET "email" = lower(trim("email"));
```

- [ ] **Step 4: Apply to a throwaway Neon branch only.** Run `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy` and expect "All migrations have been successfully applied". Then `npx prisma generate && npx tsc --noEmit`. Type errors in the show routes (`slug` now required on create) are expected and get fixed in Task 6. For now, temporarily pass `slug: nanoid(10)` in `src/app/api/shows/route.ts` create so tsc is clean.

- [ ] **Step 5: Commit** `git commit -am "[add] Schema for feed slugs, scheduled mode, publishedAt and scoped API keys"` (also `git add prisma/migrations`).

---

### Task 3: Release schedule (pure timing module)

**Files:**
- Create: `src/lib/release-schedule.ts`, `src/lib/release-schedule.test.ts`

**Interfaces:**
- Produces:
```ts
export type ScheduleSettings = { feedType: "BINGE" | "DRIP" | "DATED"; dripIntervalDays: number | null };
export type SchedulableEpisode = { episodeNumber: number; releaseAt: Date | null };
/** UTC instant the episode becomes visible for this subscriber; null = never (DATED without a date). */
export function episodeReleaseAt(ep: SchedulableEpisode, s: ScheduleSettings, startDate: Date): Date | null;
export function isReleased(ep: SchedulableEpisode, s: ScheduleSettings, startDate: Date, now: Date): boolean;
```

- [ ] **Step 1: Write failing tests** `src/lib/release-schedule.test.ts`

```ts
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
```

- [ ] **Step 2: Run** `npx vitest run src/lib/release-schedule.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `src/lib/release-schedule.ts`

```ts
export type ScheduleSettings = { feedType: "BINGE" | "DRIP" | "DATED"; dripIntervalDays: number | null };
export type SchedulableEpisode = { episodeNumber: number; releaseAt: Date | null };

const DAY = 86_400_000;

export function episodeReleaseAt(ep: SchedulableEpisode, s: ScheduleSettings, startDate: Date): Date | null {
  switch (s.feedType) {
    case "BINGE":
      return startDate;
    case "DRIP":
      return new Date(startDate.getTime() + (ep.episodeNumber - 1) * (s.dripIntervalDays ?? 1) * DAY);
    case "DATED":
      return ep.releaseAt;
  }
}

export function isReleased(ep: SchedulableEpisode, s: ScheduleSettings, startDate: Date, now: Date): boolean {
  const at = episodeReleaseAt(ep, s, startDate);
  return at !== null && now.getTime() >= at.getTime();
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/release-schedule.test.ts` → PASS. Also `TZ=Asia/Tokyo npx vitest run src/lib/release-schedule.test.ts` → PASS.

- [ ] **Step 5: Commit** `git add src/lib/release-schedule* && git commit -m "[add] Release schedule for binge, interval drip and dated episodes"`

---

### Task 4: Feed generator on the new schedule, XML-safe

**Files:**
- Modify: `src/lib/feed-generator.ts` (replace `isEpisodeVisible`, `calculatePubDate`, channel/item XML)
- Create: `src/lib/feed-generator.test.ts`

**Interfaces:**
- Consumes: `episodeReleaseAt`, `isReleased`, `ScheduleSettings` (Task 3).
- Produces: `generateFeed(show: ShowWithEpisodes, subscriber: Subscriber, baseUrl: string, now?: Date): string`. `escapeXml`, `formatDuration`, `getFeedTypeLabel` and `getDripIntervalLabel` keep their signatures (`getFeedTypeLabel` gains `"DATED" → "Dated"`).

- [ ] **Step 1: Write failing tests** `src/lib/feed-generator.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { generateFeed } from "./feed-generator";

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
```

- [ ] **Step 2: Run** `npx vitest run src/lib/feed-generator.test.ts`. Expected: FAIL (wrong signature, `complete`/CDATA issues).

- [ ] **Step 3: Implement.** Replace the top of `feed-generator.ts` through `generateItemXml` with:

```ts
import type { Show, Episode, Subscriber, FeedType } from "@prisma/client";
import { episodeReleaseAt, isReleased } from "@/lib/release-schedule";

type ShowWithEpisodes = Show & { episodes: Episode[] };

export function generateFeed(show: ShowWithEpisodes, subscriber: Subscriber, baseUrl: string, now: Date = new Date()): string {
  const items = show.episodes
    .filter((ep) => ep.isPublished)
    .filter((ep) => now.getTime() >= subscriber.startDate.getTime())
    .filter((ep) => isReleased(ep, show, subscriber.startDate, now))
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map((ep) => generateItemXml(ep, show, subscriber, pubDateFor(ep, show, subscriber)));
  return generateChannelXml(show, items.join("\n"), baseUrl);
}

function pubDateFor(ep: Episode, show: Show, sub: Subscriber): Date {
  if (show.feedType === "BINGE") return ep.publishedAt ?? ep.createdAt;
  return episodeReleaseAt(ep, show, sub.startDate)!; // non-null: only released episodes reach here
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function generateChannelXml(show: Show, itemsXml: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${cdata(show.description ?? "")}</description>
    <language>en</language>
    <itunes:author>${escapeXml(show.authorName)}</itunes:author>
    <itunes:owner><itunes:name>${escapeXml(show.authorName)}</itunes:name><itunes:email>${escapeXml(show.authorEmail)}</itunes:email></itunes:owner>
    ${show.coverArtUrl ? `<itunes:image href="${escapeXml(show.coverArtUrl)}"/>` : ""}
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type>
${itemsXml}
  </channel>
</rss>`;
}

function generateItemXml(episode: Episode, show: Show, subscriber: Subscriber, pubDate: Date): string {
  const image = episode.imageUrl || show.coverArtUrl;
  return `    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${cdata(episode.description ?? "")}</description>
      <enclosure url="${escapeXml(episode.audioUrl)}" length="${episode.fileSizeBytes}" type="audio/mpeg"/>
      <guid isPermaLink="false">${escapeXml(`${subscriber.feedToken}-${episode.id}`)}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <itunes:duration>${formatDuration(episode.durationSeconds)}</itunes:duration>
      <itunes:episode>${episode.episodeNumber}</itunes:episode>
      ${episode.seasonNumber ? `<itunes:season>${episode.seasonNumber}</itunes:season>` : ""}
      ${image ? `<itunes:image href="${escapeXml(image)}"/>` : ""}
    </item>`;
}
```

Delete `isEpisodeVisible`, `calculatePubDate`, `formatRfc2822` and the `date-fns` imports. Check `graft callers isEpisodeVisible calculatePubDate formatRfc2822` and update any callers. Add `case "DATED": return "Dated";` to `getFeedTypeLabel`.

In `src/app/api/episodes/[id]/route.ts` PATCH, and wherever an episode is created as published, set `publishedAt` on first publish: `...(data.isPublished && !existing.publishedAt ? { publishedAt: new Date() } : {})`.

Episode `releaseAt`: in the episode create route (`src/app/api/shows/[id]/episodes/route.ts`) and PATCH (`src/app/api/episodes/[id]/route.ts`), accept `releaseAt: z.string().datetime({ offset: false }).nullable().optional()`, which only accepts `...Z` UTC strings. Reject publishing (`isPublished: true`) in a DATED show when the resulting `releaseAt` is null: 400 `{ error: "release_date_required" }`. In `src/components/forms/episode-form.tsx`, when the show is DATED, render `<input type="datetime-local">` labelled **"Release (UTC)"**. Submit `` `${value}:00.000Z` `` and prefill with `releaseAt.toISOString().slice(0,16)`, so the browser's local timezone is never applied. On the show page episode table, show the date as `toISOString().replace("T"," ").slice(0,16) + " UTC"`.

Restrict audio uploads to MP3: in `src/app/api/upload/route.ts`, reject with 400 when `type === "audio"` and `getContentType(filename) !== "audio/mpeg"`.

- [ ] **Step 4: Run** `npx vitest run` → all PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** `git commit -am "[fix] Feed generator uses release schedule, stable dates and valid XML"`

---

### Task 5: Feed route hardening

**Files:**
- Modify: `src/app/api/feeds/[token]/route.ts`
- Create: `src/app/api/feeds/[token]/route.test.ts`

**Interfaces:**
- Consumes: `generateFeed(show, sub, baseUrl, now)` (Task 4), `getEnv().APP_URL` (Task 1).
- Produces: `GET` and `HEAD` handlers. Analytics never blocks or fails a feed.

- [ ] **Step 1: Write failing test** (mock db with `vi.mock`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sub = { id: "u1", status: "ACTIVE", activatedAt: null, feedToken: "tok", startDate: new Date(0),
  show: { feedType: "BINGE", title: "T", authorName: "A", authorEmail: "a@x.co", episodes: [] } };
const db = {
  subscriber: { findUnique: vi.fn(), update: vi.fn() },
  feedRequest: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://feeds.launchcastformula.com" }) }));
const { GET, HEAD } = await import("./route");
const ctx = { params: Promise.resolve({ token: "tok" }) };
const req = (m = "GET") => new Request("https://x/api/feeds/tok", { method: m }) as any;

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
```

- [ ] **Step 2: Run** → FAIL (no HEAD export; analytics failure → 500).

- [ ] **Step 3: Implement** the route:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateFeed } from "@/lib/feed-generator";
import { getEnv } from "@/lib/env";

type Ctx = { params: Promise<{ token: string }> };
const HEADERS = { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "private, no-store, max-age=0" };

async function load(token: string) {
  const s = await db.subscriber.findUnique({ where: { feedToken: token }, include: { show: { include: { episodes: true } } } });
  return s && s.status === "ACTIVE" ? s : null;
}

function bestEffort(p: Promise<unknown>, ms = 1500) {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch((e) => console.error("feed analytics failed", e?.message));
}

export async function HEAD(_req: NextRequest, { params }: Ctx) {
  const s = await load((await params).token);
  return new NextResponse(null, { status: s ? 200 : 404, headers: { "Cache-Control": HEADERS["Cache-Control"], ...(s ? { "Content-Type": HEADERS["Content-Type"] } : {}) } });
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const s = await load((await params).token);
    if (!s) return new NextResponse("Feed not found", { status: 404, headers: { "Cache-Control": HEADERS["Cache-Control"] } });
    const xml = generateFeed(s.show, s, getEnv().APP_URL);
    await Promise.all([
      bestEffort(db.feedRequest.create({ data: {
        subscriberId: s.id,
        userAgent: request.headers.get("user-agent"),
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown",
      } })),
      s.activatedAt ? Promise.resolve() : bestEffort(db.subscriber.update({ where: { id: s.id }, data: { activatedAt: new Date() } })),
    ]);
    return new NextResponse(xml, { headers: HEADERS });
  } catch (error) {
    console.error("Feed generation error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
```

- [ ] **Step 4: Run** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `git commit -am "[fix] Feed route: best-effort analytics, HEAD support, private no-store"`

---

### Task 6: Scoped API keys + show settings (slug, modes, lock)

**Files:**
- Create: `src/lib/api-keys.ts`, `src/lib/api-keys.test.ts`, `src/lib/show-settings.ts`, `src/lib/show-settings.test.ts`, `src/app/api/api-keys/route.ts`, `src/app/api/api-keys/[id]/route.ts`
- Modify: `src/app/api/shows/route.ts`, `src/app/api/shows/[id]/route.ts` (PATCH), `src/components/forms/show-form.tsx`, `src/app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Produces:
```ts
// api-keys.ts
export function generateApiKey(): { raw: string; prefix: string; hash: string }; // raw = "lcf_live_" + nanoid(32)
export function hashApiKey(raw: string): string;                               // sha256 hex
export function parseBearer(header: string | null): string | null;             // strict "Bearer <token>"
export async function authenticateKey(header: string | null): Promise<{ id: string; showIds: string[] } | null>;
// show-settings.ts
export const ShowSettingsSchema: z.ZodType<...>;   // create
export const ShowPatchSchema;                       // partial, omitted fields untouched
export const LOCKED_FIELDS: readonly ["slug","feedType","dripIntervalDays"];
export function lockedFieldViolations(patch: Record<string, unknown>, current: Record<string, unknown>, subscriberCount: number): string[];
```

- [ ] **Step 1: Write failing tests**

`src/lib/api-keys.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, parseBearer } from "./api-keys";

describe("api keys", () => {
  it("generates a prefixed key whose hash verifies", () => {
    const k = generateApiKey();
    expect(k.raw).toMatch(/^lcf_live_[A-Za-z0-9_-]{32}$/);
    expect(k.prefix).toBe(k.raw.slice(0, 12));
    expect(hashApiKey(k.raw)).toBe(k.hash);
  });
  it("parses only strict Bearer syntax", () => {
    expect(parseBearer("Bearer abc")).toBe("abc");
    expect(parseBearer("bearer abc")).toBe("abc");
    expect(parseBearer("abc")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});
```

`src/lib/show-settings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ShowSettingsSchema, lockedFieldViolations } from "./show-settings";

const ok = { title: "T", authorName: "A", authorEmail: "a@x.co", slug: "dbt-audio-series", feedType: "BINGE" };

describe("ShowSettingsSchema", () => {
  it("accepts binge", () => expect(ShowSettingsSchema.safeParse(ok).success).toBe(true));
  it("rejects bad slug", () => expect(ShowSettingsSchema.safeParse({ ...ok, slug: "Has Space" }).success).toBe(false));
  it("accepts DATED with no interval", () => {
    expect(ShowSettingsSchema.safeParse({ ...ok, feedType: "DATED" }).success).toBe(true);
  });
  it("rejects unknown mode", () => expect(ShowSettingsSchema.safeParse({ ...ok, feedType: "SCHEDULED" }).success).toBe(false));
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
```

- [ ] **Step 2: Run** → FAIL (modules missing).

- [ ] **Step 3: Implement** `src/lib/api-keys.ts`:
```ts
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";

export function hashApiKey(raw: string) { return createHash("sha256").update(raw).digest("hex"); }
export function generateApiKey() {
  const raw = `lcf_live_${nanoid(32)}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashApiKey(raw) };
}
export function parseBearer(header: string | null) {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}
export async function authenticateKey(header: string | null) {
  const raw = parseBearer(header);
  if (!raw) return null;
  const key = await db.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) }, include: { shows: true } });
  if (!key || key.revokedAt) return null;
  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: key.id, showIds: key.shows.map((s) => s.showId) };
}
```
(Hash lookup on a unique index works as a constant-time comparison here, because the attacker never controls the stored hash.)

`src/lib/show-settings.ts`:
```ts
import { z } from "zod";

const Base = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  authorName: z.string().trim().min(1).max(200),
  authorEmail: z.string().email(),
  coverArtUrl: z.string().url().optional().or(z.literal("")),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  acceptingSubscribers: z.boolean().optional(),
  feedType: z.enum(["BINGE", "DRIP", "DATED"]),
  dripIntervalDays: z.number().int().min(1).max(30).optional(),
});

export const ShowSettingsSchema = Base;
});
export const ShowPatchSchema = Base.partial();

export const LOCKED_FIELDS = ["slug", "feedType", "dripIntervalDays"] as const;

export function lockedFieldViolations(patch: Record<string, unknown>, current: Record<string, unknown>, subscriberCount: number) {
  if (subscriberCount === 0) return [];
  return LOCKED_FIELDS.filter((f) => f in patch && patch[f] !== current[f]);
}
```

Route changes:
- `src/app/api/shows/route.ts` POST: replace `CreateShowSchema` with `ShowSettingsSchema` and write the new fields. Return 409 `{ error: "slug_taken" }` on Prisma `P2002`. Remove the Task 2 `nanoid` slug stub.
- `src/app/api/shows/[id]/route.ts` PATCH: parse with `ShowPatchSchema` (400 on failure, 400 on malformed JSON). Load the show plus `_count.subscribers`. If `lockedFieldViolations(...)` is non-empty, return 409 `{ error: "locked_after_subscribers", fields }`. Update only keys present in the parsed data, so omitted values stay unchanged.
- `src/app/api/api-keys/route.ts`: session-guarded. `GET` lists `{id,name,prefix,createdAt,lastUsedAt,revokedAt,shows:[slug]}`. `POST {name, showIds[]}` creates and returns `{ raw }` **once**.
- `src/app/api/api-keys/[id]/route.ts`: session-guarded `DELETE` sets `revokedAt`.
- `show-form.tsx`: add a Slug input (auto-suggested from the title, disabled once subscribers exist), a third mode option **"Dated (fixed UTC release per episode)"** that hides the interval field, an "Accepting subscribers" toggle, and an interval of 1–30 for DRIP.
- `settings/page.tsx`: delete the `Full key: {user?.apiKey}` render (it currently prints the secret into HTML). Replace with a keys table, a create form (name + feed checkboxes) that shows the raw key once in a copy box, and revoke buttons.

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint` → PASS/clean. Manual check: `npm run dev` with `DATABASE_URL=$TEST_DATABASE_URL` plus test env. Create a DATED show, add two episodes with UTC release dates (one past, one future), create a key scoped to it and confirm the raw key is shown once. Add a subscriber via the dashboard, then try changing feed type and confirm a 409 toast.

- [ ] **Step 5: Commit** `git commit -am "[add] Scoped hashed API keys and validated show settings with cadence lock"` (plus `git add` new files).

---

### Task 7: Subscribe service + `POST /api/v1/subscribe`

**Files:**
- Create: `src/lib/subscribe.ts`, `src/lib/subscribe.test.ts` (DB-backed), `src/app/api/v1/subscribe/route.ts`, `src/app/api/v1/subscribe/route.test.ts` (mocked)
- Modify: `src/app/api/v1/shows/[showId]/subscribers/route.ts`, `src/middleware.ts` (no change needed: `/api/v1` is already public. Confirm it.)

**Interfaces:**
- Consumes: `authenticateKey` (Task 6), `getEnv().APP_URL` (Task 1), `db`.
- Produces:
```ts
export function normalizeEmail(e: string): string;
export type SubscribeResult =
  | { kind: "ok"; created: boolean; subscriber: Subscriber }
  | { kind: "revoked" };
export async function subscribe(input: { showId: string; email: string; name?: string | null; externalRef?: string | null }): Promise<SubscribeResult>;
export function feedUrl(token: string): string; // `${APP_URL}/api/feeds/${token}`
```

- [ ] **Step 1: Write failing DB test** `src/lib/subscribe.test.ts` (skips without `TEST_DATABASE_URL`):

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("subscribe (real Postgres)", () => {
  let subscribe: typeof import("./subscribe").subscribe;
  let db: typeof import("./db").db;
  let showId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("./db"));
    ({ subscribe } = await import("./subscribe"));
  });
  beforeEach(async () => {
    await db.subscriber.deleteMany();
    await db.show.deleteMany();
    const user = await db.user.upsert({ where: { email: "t@test.local" }, create: { email: "t@test.local" }, update: {} });
    showId = (await db.show.create({ data: { userId: user.id, title: "T", authorName: "A", authorEmail: "a@x.co", slug: "t-" + Date.now(), feedType: "DRIP", dripIntervalDays: 1 } })).id;
  });

  it("normalizes email", async () => {
    const r = await subscribe({ showId, email: "  Jane@Example.COM " });
    expect(r.kind === "ok" && r.subscriber.email).toBe("jane@example.com");
  });
  it("returns same token on repeat and does not reset startDate", async () => {
    const a = await subscribe({ showId, email: "a@x.co" });
    const b = await subscribe({ showId, email: "A@X.co" });
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error();
    expect(a.created).toBe(true); expect(b.created).toBe(false);
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
    if (a.kind !== "ok") throw new Error();
    await db.subscriber.update({ where: { id: a.subscriber.id }, data: { status: "REVOKED" } });
    expect((await subscribe({ showId, email: "r@x.co" })).kind).toBe("revoked");
    expect((await db.subscriber.findUnique({ where: { id: a.subscriber.id } }))!.status).toBe("REVOKED");
  });
});
```

- [ ] **Step 2: Run** `TEST_DATABASE_URL=<neon test branch url> npx vitest run src/lib/subscribe.test.ts` → FAIL (module missing). Without the env var it reports "skipped". **Do not mark the task done on a skip.** This task needs a real run against the test branch.

- [ ] **Step 3: Implement** `src/lib/subscribe.ts`:

```ts
import { nanoid } from "nanoid";
import type { Subscriber } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const feedUrl = (token: string) => `${getEnv().APP_URL}/api/feeds/${token}`;

export type SubscribeResult = { kind: "ok"; created: boolean; subscriber: Subscriber } | { kind: "revoked" };

export async function subscribe(input: { showId: string; email: string; name?: string | null; externalRef?: string | null }): Promise<SubscribeResult> {
  const email = normalizeEmail(input.email);
  const token = nanoid(32);
  // INSERT … ON CONFLICT DO NOTHING is atomic; a single statement means no lookup/create race.
  const inserted = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO subscribers (id, show_id, email, name, feed_token, external_ref, start_date, status, created_at, updated_at)
    VALUES (${nanoid(25)}, ${input.showId}, ${email}, ${input.name ?? null}, ${token}, ${input.externalRef ?? null}, now(), 'ACTIVE', now(), now())
    ON CONFLICT (show_id, email) DO NOTHING
    RETURNING id`;
  const subscriber = await db.subscriber.findUniqueOrThrow({ where: { showId_email: { showId: input.showId, email } } });
  if (subscriber.status === "REVOKED") return { kind: "revoked" };
  return { kind: "ok", created: inserted.length === 1, subscriber };
}
```
(The `id` is a nanoid rather than a cuid. Both are opaque strings in a `TEXT` PK, and Prisma's `@default(cuid())` only applies to Prisma-issued inserts.)

- [ ] **Step 4: Run** the DB test → PASS (4/4, not skipped).

- [ ] **Step 5: Write failing route test** `src/app/api/v1/subscribe/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateKey = vi.fn();
const subscribe = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/api-keys", () => ({ authenticateKey }));
vi.mock("@/lib/subscribe", () => ({ subscribe, feedUrl: (t: string) => `https://feeds.launchcastformula.com/api/feeds/${t}` }));
vi.mock("@/lib/db", () => ({ db: { show: { findUnique } } }));
const { POST } = await import("./route");

const call = (body: unknown, auth = "Bearer k") =>
  POST(new Request("https://x/api/v1/subscribe", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }) as any);
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
    expect(await res.json()).toMatchObject({ feed_url: "https://feeds.launchcastformula.com/api/feeds/tok", created: true, feed: "dbt", status: "active" });
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
```

- [ ] **Step 6: Run** → FAIL (route missing).

- [ ] **Step 7: Implement** `src/app/api/v1/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateKey } from "@/lib/api-keys";
import { subscribe, feedUrl } from "@/lib/subscribe";

const MAX_BYTES = 8 * 1024;
const Body = z.strictObject({
  feed: z.string().min(1).max(64),
  email: z.string().trim().max(254).email(),
  first_name: z.string().trim().max(100).optional(),
  name: z.string().trim().max(200).optional(),
  external_id: z.string().max(200).optional(),
});
const err = (status: number, error: string, extra?: object) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request: NextRequest) {
  try {
    const key = await authenticateKey(request.headers.get("authorization"));
    if (!key) return err(401, "unauthorized");

    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BYTES) return err(413, "payload_too_large");
    let json: unknown;
    try { json = JSON.parse(text); } catch { return err(400, "invalid_request", { issues: [{ message: "Malformed JSON" }] }); }
    const parsed = Body.safeParse(json);
    if (!parsed.success) return err(400, "invalid_request", { issues: parsed.error.issues });
    const { feed, email, first_name, name, external_id } = parsed.data;

    const show = await db.show.findUnique({ where: { slug: feed } });
    if (!show || !key.showIds.includes(show.id)) return err(404, "feed_not_found");
    if (!show.acceptingSubscribers) return err(403, "feed_closed");

    const r = await subscribe({ showId: show.id, email, name: first_name ?? name ?? null, externalRef: external_id ?? null });
    if (r.kind === "revoked") return err(409, "subscriber_revoked");

    return NextResponse.json({
      feed_url: feedUrl(r.subscriber.feedToken),
      subscriber_id: r.subscriber.id,
      feed: show.slug,
      status: "active",
      created: r.created,
      start_date: r.subscriber.startDate.toISOString(),
    }, { status: r.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("subscribe error", (e as Error).message);
    return err(500, "internal_error");
  }
}
```

- [ ] **Step 8: Update legacy route.** In `src/app/api/v1/shows/[showId]/subscribers/route.ts` POST: authenticate with `authenticateKey` and require `showIds.includes(showId)`, replacing the `user.apiKey` lookup. Parse JSON in a try (400 on malformed input). Call `subscribe(...)`, return 409 on revoked, and remove the auto-reactivate block and the `start_date` override. GET uses the same auth. Keep the response field names unchanged for existing callers.

- [ ] **Step 9: Run** `npx vitest run` (with `TEST_DATABASE_URL` set) → all PASS. Then smoke-test locally:
```bash
curl -s -X POST localhost:3000/api/v1/subscribe -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"feed":"<slug>","email":"test+1@example.com","first_name":"Test"}' | jq
curl -s "$(…feed_url…)" | head -20   # valid RSS
```

- [ ] **Step 10: Commit** `git add src/lib/subscribe* src/app/api/v1 && git commit -m "[add] Subscribe API returns a per-subscriber private feed URL"`

---

### Task 8: Caller contract and deployment config

**Files:**
- Create: `docs/API.md`, `docs/DEPLOYMENT.md`, `vercel.json`
- Modify: `.env.example`, `cors-policy.json`, `README.md` (replace create-next-app boilerplate with a pointer to docs)

**Interfaces:**
- Consumes: the contract in this plan's "API contract" section, verbatim.

- [ ] **Step 1: `vercel.json`**
```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["lhr1"] }
```
(Set the region to match the Neon project region chosen in Task 9. `lhr1` pairs with Neon `aws-eu-west-2`.)

- [ ] **Step 2: `.env.example`.** Add `DATABASE_URL_UNPOOLED` (migrations), set `NEXT_PUBLIC_APP_URL="https://feeds.launchcastformula.com"` and `R2_PUBLIC_URL="https://media.launchcastformula.com"`, and remove nothing else. In `prisma.config.ts`, use `process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL` for the datasource so migrations go over a direct connection.

- [ ] **Step 3: `cors-policy.json`.** Set AllowedOrigins to `["https://feeds.launchcastformula.com", "http://localhost:3000"]`, methods `PUT, GET, HEAD`, headers `content-type`.

- [ ] **Step 4: `docs/API.md`** contains: the endpoint, auth header, request/response table, error codes, and the idempotency guarantee (same email + feed → same URL). Also these notes: "feed_url may be emailed and shown in the confirmation modal; wrong-address signups are fixed by revoking in the dashboard", "first_name optional", and "`external_id` stored for tracing only". Include a Netlify function example:

```js
// netlify/functions/subscribe.mjs (excerpt, server-side only)
const res = await fetch(`${process.env.PODCAST_API_BASE_URL}/api/v1/subscribe`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.PODCAST_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ feed: "dbt-audio-series", email, first_name: firstName, external_id: captureId }),
  signal: AbortSignal.timeout(5000),
});
if (res.ok) {
  const { feed_url } = await res.json();
  // write feed_url to the ESP contact field (e.g. Bento `podcast_feed_url`) and fire the event that sends the email
} else if (res.status >= 500 || res.status === 0) {
  // keep the captured opt-in for retry; safe to retry, the API is idempotent
}
```

- [ ] **Step 5: `docs/DEPLOYMENT.md`** is the Task 9 runbook below, with the env var table (name, where it's set, secret yes/no) and the rollback steps from the Sept 17 plan (stop new subscriptions with `acceptingSubscribers=false` or by revoking a key, keep feeds serving, never reset the DB).

- [ ] **Step 6: Verify.** `npm run build` with dummy env → success. `npx vitest run` → PASS.
- [ ] **Step 7: Commit** `git add docs vercel.json .env.example cors-policy.json prisma.config.ts README.md && git commit -m "[add] API contract, deployment runbook and Vercel config"`

---

### Task 9: Provision and go live (needs AJ's go-ahead: spend, DNS, deploy)

This is an operations task, so there's no TDD here. Each step lists the command and how to check it worked. **Stop and get explicit authorization before step 1.** This plan does not authorize spend or external changes.

- [ ] **Step 1: Confirm accounts.** Check the Vercel team `ajsilvers-projects` plan tier (Pro is needed for commercial use). Find where `launchcastformula.com` DNS is hosted (`dig NS launchcastformula.com +short`). Check whether Neon and Cloudflare R2 accounts exist (`reference/services.md`). Report any gaps.
- [ ] **Step 2: Neon.** Create project `private-podcast` in `aws-eu-west-2` with branches `main` (prod) and `staging`. Record the pooled and unpooled URLs in Vercel env only. Check: `DATABASE_URL_UNPOOLED=<staging> npx prisma migrate deploy` → applied.
- [ ] **Step 3: R2.** Create bucket `launchcast-feeds`, scoped API token (object read/write on that bucket), custom domain `media.launchcastformula.com`, and apply `cors-policy.json`. Check: `curl -I https://media.launchcastformula.com/<test.mp3>` → 200, and `curl -r 0-99 -I` → 206.
- [ ] **Step 4: Vercel project.** Run `vercel link`, set the env vars per `docs/DEPLOYMENT.md` for Production and Preview (Preview → Neon `staging`), and confirm the framework is Next.js. Make sure Deployment Protection does **not** cover production. Feeds and the API must be reachable without a login.
- [ ] **Step 5: Staging deploy.** `vercel deploy` (preview). Check: log in to the dashboard, create a BINGE and a DATED show with real MP3s, create a key, `curl` the subscribe endpoint, and subscribe to the returned URL in Apple Podcasts plus one other app. Confirm playback.
- [ ] **Step 6: Domain.** Add `feeds.launchcastformula.com` to the project and create the CNAME → `cname.vercel-dns.com` at the DNS host. Check: `curl -I https://feeds.launchcastformula.com/login` → 200 with a valid TLS cert.
- [ ] **Step 7: Production.** `DATABASE_URL_UNPOOLED=<prod> npx prisma migrate deploy`, then `vercel deploy --prod`. Check: repeat the step 5 smoke test against production with a test address, revoke that subscriber, and confirm the feed now returns 404.
- [ ] **Step 8: Record.** Add the app to `reference/services.md` (host, domain, DB, bucket; no secrets) and log it in today's daily log in OS. Issue per-site keys only when the website integration plans start.

---

## Out of scope (follow-up plans)

- Done by Three and ajsilvers.com form changes (Netlify capture/replay, Bento field + email automation). Each gets its own plan in its repo, using `docs/API.md`.
- Fixed-calendar-date release mode, a magic-link "your feed" page, audio access control, analytics dashboard.
- Multi-tenant client accounts (if LaunchCast clients later get their own shows, ApiKey→Show scoping already supports per-client keys).
