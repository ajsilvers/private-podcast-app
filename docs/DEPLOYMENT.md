# Deployment runbook

Target: **Vercel** (Next.js, Node runtime) + **Neon** Postgres + **Cloudflare R2** for audio and artwork.
App at `https://feeds.launchcastformula.com`, media at `https://media.launchcastformula.com`.

Nothing here has been run yet. Each step needs AJ's go-ahead because it spends money, changes DNS or deploys.

## Environment variables

| Name | Where | Secret | Notes |
|---|---|---|---|
| `DATABASE_URL` | Vercel (Prod → Neon `main`, Preview → Neon `staging`) | yes | Neon **pooled** endpoint (`-pooler` host) |
| `DATABASE_URL_UNPOOLED` | Local shell when migrating | yes | Neon **direct** endpoint; read by `prisma.config.ts` for migrations |
| `DATABASE_POOL_MAX` | optional | no | Default 5 |
| `ADMIN_PASSWORD` | Vercel | yes | Dashboard login |
| `SESSION_SECRET` | Vercel | yes | ≥32 chars, `openssl rand -base64 32`. The app refuses to run without it. |
| `NEXT_PUBLIC_APP_URL` | Vercel | no | `https://feeds.launchcastformula.com` (Preview: its own URL). **Never change in production once feed links are issued.** |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Vercel | yes (keys) | Token scoped to the one bucket |
| `R2_PUBLIC_URL` | Vercel | no | `https://media.launchcastformula.com` (not `r2.dev`, which Cloudflare reserves for non-production) |

Site keys are **not** environment variables in this app. They're created in Settings → API Keys and stored hashed in the database.

## First deployment

1. **Accounts.** Confirm the Vercel team `ajsilvers-projects` is on **Pro** (Hobby is non-commercial only). Find the DNS host: `dig NS launchcastformula.com +short`. Confirm Neon and Cloudflare accounts.
2. **Neon.** Create project `private-podcast` in `aws-eu-west-2` (London, matching `vercel.json` region `lhr1`), with branches `main` and `staging`. Then:
   ```bash
   DATABASE_URL_UNPOOLED=<staging direct url> npx prisma migrate deploy
   TEST_DATABASE_URL=<staging-test branch url> npx vitest run   # DB tests on real Neon, not PGlite
   ```
3. **R2.** Create bucket `launchcast-feeds`, an API token with object read/write on that bucket only, and the custom domain `media.launchcastformula.com`. Apply `cors-policy.json` (Bucket → Settings → CORS). Check:
   ```bash
   curl -I https://media.launchcastformula.com/<test>.mp3         # 200
   curl -I -r 0-99 https://media.launchcastformula.com/<test>.mp3 # 206 (seeking works)
   ```
4. **Vercel project.** `vercel link` (team `ajsilvers-projects`), set the variables above for Production and Preview, and confirm the framework is Next.js. The build command comes from `package.json` (`prisma generate && next build`). **Deployment Protection must not cover Production**, because podcast apps and site servers can't log in.
5. **Staging check.** `vercel deploy`, then:
   - log in, create one BINGE and one DATED show with real MP3s and artwork
   - Settings → create a key for the test show
   - `curl` the subscribe API (see `docs/API.md`), subscribe to the returned URL in Apple Podcasts plus one other app, and play an episode
   - for DATED, set one episode a few minutes in the future and confirm it appears after that time
6. **Domain.** In Vercel, add `feeds.launchcastformula.com` to the project. At the DNS host, create `CNAME feeds → cname.vercel-dns.com`. Check: `curl -I https://feeds.launchcastformula.com/login` returns 200 with a valid certificate.
7. **Production.**
   ```bash
   DATABASE_URL_UNPOOLED=<prod direct url> npx prisma migrate deploy
   vercel deploy --prod
   ```
   Repeat the step 5 checks with a test address, then revoke it and confirm its feed returns 404.
8. **Record.** Add host, domain, database and bucket (no secrets) to `~/Work/os/reference/services.md` and log it in the OS daily log. Create per-site keys only when each site's integration starts.

## Each release

1. `npm test`, `npm run lint`, `npx tsc --noEmit`.
2. If `prisma/migrations` changed: back up first (Neon branch from `main`), then run `DATABASE_URL_UNPOOLED=<prod direct> npx prisma migrate deploy` **before** deploying the code. Migrations must be additive. Never run `migrate dev`, `migrate reset` or `db push` against production.
3. `vercel deploy --prod` (or push to the production branch once Git is connected).

## Migration note (20261004000000_subscribe_api)

- Existing shows get their id as their slug. Rename each slug in the dashboard **before** creating keys, because the slug is locked once a show has subscribers.
- Already-published episodes get `published_at = created_at`.
- Subscriber emails are lowercased. If two subscribers on one show differ only by case, the migration **aborts** and changes nothing. Reconcile those rows by hand, then rerun.

## Rollback and stopping new signups

- Stop a feed taking new subscribers: untick **Accepting new subscribers** on the show. The API then returns 403 and existing feeds keep working.
- Cut off a site: revoke its key in Settings. The API then returns 401.
- Bad deploy: use Vercel "Promote" on the previous deployment. Only roll back to builds compatible with the current schema. Don't undo additive migrations or reset the database.
- Feed URLs and `NEXT_PUBLIC_APP_URL` must stay the same through any rollback.
