# Private Podcast MVP Implementation Plan

**Created:** February 12, 2026
**Status:** Ready for Development
**Target:** Single-user MVP with webhook integration

---

## Executive Summary

This document captures the planning decisions and implementation approach for building an MVP of the Private Podcast Platform. The full PRD and Technical Spec outlined a multi-user SaaS platform, but for the initial MVP we've simplified the scope while maintaining the core value proposition.

---

## Scope Decisions

### What Changed from Original Spec

| Component | Original Spec | MVP Decision | Rationale |
|-----------|--------------|--------------|-----------|
| Feed Types | Binge, Drip, Date-Based | **Binge + Drip only** | Date-Based is advanced use case not needed initially |
| Subscriber Import | Manual + CSV + Webhook | **Manual + Webhook API** | CSV not needed, webhook critical for marketing integration |
| Authentication | NextAuth + bcrypt + multi-user | **Minimal password auth** | Single admin user, env var password, simplest for MVP |
| User Management | Full registration flow | **Single admin user** | Only one user initially |
| Analytics | Full dashboard with charts | **Basic counts** | Per-show subscriber stats sufficient |
| Database | Standalone PostgreSQL | **Neon.tech** | Serverless PostgreSQL, excellent Vercel integration, branching |
| Storage | AWS S3 | **Cloudflare R2** | No egress fees, user preference |
| Hosting | Not specified | **Vercel** | Best Next.js support, seamless deployment |

### What Was Removed (Not Needed for MVP)

- Date-Based feed type
- CSV bulk import feature
- Multi-user registration system
- Complex analytics dashboard
- Account-level subscriber database

### What Was Retained (Core Features)

- Dynamic RSS feed generation with personalized pubDates
- Binge feed type (all episodes immediately visible)
- Drip feed type (episodes release on schedule relative to signup)
- Show management (create, edit shows)
- Episode management (upload audio, reorder, publish/unpublish)
- Subscriber management (add manually, revoke, reactivate)
- Webhook API for external integration (ConvertKit, ActiveCampaign, etc.)
- Feed request logging for basic analytics
- Unique feed URLs per subscriber

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Vercel                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Next.js 14 Application                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │  Dashboard  │  │  Login Page │  │  API Routes │  │    │
│  │  │   (React)   │  │  (Password) │  │  (Node.js)  │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │    Neon     │    │  Cloudflare │    │   Podcast   │
│  PostgreSQL │    │      R2     │    │    Apps     │
   │  (Serverless)│    │  (Storage)  │    │  (Clients)  │
   └─────────────┘    └─────────────┘    └─────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 14+ |
| Language | TypeScript | 5.x |
| UI Components | Shadcn/ui | Latest |
| Styling | Tailwind CSS | 3.x |
| Database | Neon PostgreSQL | - |
| ORM | Prisma | 5.x |
| Authentication | Minimal (env var password) | - |
| File Storage | Cloudflare R2 | - |
| Validation | Zod | 3.x |
| Date Handling | date-fns | 3.x |

---

## Database Schema

### Prisma Models

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  apiKey       String   @unique @default(cuid())
  createdAt    DateTime @default(now())
  shows        Show[]
}

model Show {
  id               String    @id @default(cuid())
  userId           String
  title            String
  description      String?   @db.Text
  authorName       String
  authorEmail      String
  coverArtUrl      String?
  feedType         FeedType  @default(DRIP)
  dripIntervalDays Int?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  
  user        User         @relation(fields: [userId], references: [id])
  episodes    Episode[]
  subscribers Subscriber[]
}

model Episode {
  id              String    @id @default(cuid())
  showId          String
  title           String
  description     String?   @db.Text
  audioUrl        String
  durationSeconds Int
  fileSizeBytes   Int
  episodeNumber   Int
  seasonNumber    Int?
  isPublished     Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  show Show @relation(fields: [showId], references: [id], onDelete: Cascade)
  
  @@unique([showId, episodeNumber])
}

model Subscriber {
  id          String           @id @default(cuid())
  showId      String
  email       String
  name        String?
  feedToken   String           @unique
  startDate   DateTime         @default(now())
  status      SubscriberStatus @default(ACTIVE)
  activatedAt DateTime?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  
  show         Show          @relation(fields: [showId], references: [id], onDelete: Cascade)
  feedRequests FeedRequest[]
  
  @@unique([showId, email])
}

model FeedRequest {
  id           String   @id @default(cuid())
  subscriberId String
  requestedAt  DateTime @default(now())
  userAgent    String?
  ipAddress    String?
  
  subscriber Subscriber @relation(fields: [subscriberId], references: [id], onDelete: Cascade)
  
  @@index([subscriberId, requestedAt])
}

enum FeedType {
  BINGE
  DRIP
}

enum SubscriberStatus {
  ACTIVE
  REVOKED
}
```

---

## Core Logic: Feed Generation

### Episode Visibility Rules

#### Binge Feed
- All published episodes immediately visible
- PubDates calculated backwards from subscriber start date
- Episode N pubDate = startDate - (totalEpisodes - N) days
- Example: 5 episodes, subscriber starts Monday
  - Episode 1: Sunday (start - 4 days)
  - Episode 2: Saturday (start - 3 days)
  - Episode 5: Monday (start date)

#### Drip Feed
- Episode N visible if: currentDate >= startDate + ((N-1) × intervalDays)
- Episode N pubDate = startDate + ((N-1) × intervalDays)
- Example: Daily drip, subscriber starts Monday
  - Episode 1: visible Monday, pubDate = Monday
  - Episode 2: visible Tuesday, pubDate = Tuesday
  - Episode 3: visible Wednesday, pubDate = Wednesday

### RSS XML Requirements

Must generate valid RSS 2.0 with iTunes podcast namespace:
- `<title>`, `<description>`, `<language>`
- `<itunes:author>`, `<itunes:owner>`, `<itunes:image>`
- `<itunes:explicit>`, `<itunes:type>`
- Per episode: `<enclosure>`, `<guid>`, `<pubDate>`, `<itunes:duration>`

---

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feeds/[token]` | RSS feed for subscriber (podcast apps) |

### Protected Endpoints (Require Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shows` | List user's shows |
| POST | `/api/shows` | Create new show |
| GET | `/api/shows/[id]` | Get show details |
| PATCH | `/api/shows/[id]` | Update show |
| DELETE | `/api/shows/[id]` | Delete show |
| POST | `/api/shows/[id]/episodes` | Create episode |
| GET | `/api/shows/[id]/subscribers` | List subscribers |
| POST | `/api/shows/[id]/subscribers` | Add subscriber manually |
| PATCH | `/api/episodes/[id]` | Update episode |
| DELETE | `/api/episodes/[id]` | Delete episode |
| POST | `/api/subscribers/[id]/revoke` | Revoke subscriber |
| POST | `/api/subscribers/[id]/reactivate` | Reactivate subscriber |
| POST | `/api/upload` | Get presigned upload URL |

### Webhook API (API Key Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/shows/[showId]/subscribers` | Add subscriber via webhook |
| DELETE | `/api/v1/subscribers/[id]` | Revoke subscriber via webhook |

### Webhook Request/Response

**Request:**
```json
POST /api/v1/shows/{showId}/subscribers
Authorization: Bearer {apiKey}

{
  "email": "subscriber@example.com",
  "name": "John Doe"
}
```

**Response (201 Created):**
```json
{
  "id": "clx123abc",
  "email": "subscriber@example.com",
  "name": "John Doe",
  "feed_url": "https://yourdomain.com/api/feeds/abc123token...",
  "status": "active",
  "start_date": "2026-02-12T10:00:00Z"
}
```

---

## Development Phases

### Phase 1: Project Setup (~1 hour)
- [x] Initialize Next.js 14 with TypeScript, Tailwind, App Router
- [x] Configure Neon database client
- [x] Initialize Shadcn UI
- [x] Set up environment variables template
- [x] Configure Cloudflare R2 credentials

### Phase 2: Database Schema (~1 hour)
- [x] Create Prisma schema with all models
- [x] Set up Neon PostgreSQL connection
- [x] Run initial migration
- [x] Generate Prisma client
- [x] Create database utility (singleton pattern with pg adapter)

### Phase 3: Core Feed Logic (~2-3 hours)
- [x] Implement feed generator module
- [x] Episode visibility functions (Binge + Drip)
- [x] PubDate calculation functions
- [x] RSS XML generation with iTunes namespace
- [x] Create `/api/feeds/[token]` endpoint
- [x] Feed request logging

### Phase 4: Authentication + Layout (~1 hour)
- [x] Create login page with password field
- [x] Implement session cookie for auth state (iron-session)
- [x] Create auth middleware for protected routes
- [x] Create dashboard layout with sidebar

### Phase 5: Show Management (~2 hours)
- [x] Show list page with cards
- [x] Create show form component
- [x] New show page
- [x] Show detail page with tabs
- [x] Edit show functionality

### Phase 6: Episode Management (~2-3 hours)
- [x] Episode list component
- [x] Episode form component
- [x] Episode CRUD API routes
- [x] File upload component

### Phase 7: File Uploads (~1-2 hours)
- [x] R2 client utilities (presigned URLs)
- [x] Upload API route
- [x] File upload component
- [x] Audio duration extraction (client-side)

### Phase 8: Subscriber Management (~1-2 hours)
- [x] Subscriber list component
- [x] Add subscriber dialog
- [x] Revoke/reactivate actions
- [x] Basic subscriber stats

### Phase 9: Webhook API (~1 hour)
- [x] Add subscriber webhook endpoint
- [x] API key authentication
- [x] Settings page with API key display

### Phase 10: Polish (~1 hour)
- [x] Error handling
- [x] Environment example file

**Total Estimated Time: 11-15 hours**

---

## File Structure

```
private-podcast/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx (redirect to /shows)
│   │   │   ├── shows/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   ├── feeds/
│   │   │   │   └── [token]/
│   │   │   │       └── route.ts
│   │   │   ├── shows/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── episodes/
│   │   │   │       │   └── route.ts
│   │   │   │       └── subscribers/
│   │   │   │           └── route.ts
│   │   │   ├── episodes/
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts
│   │   │   ├── subscribers/
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── revoke/
│   │   │   │       │   └── route.ts
│   │   │   │       └── reactivate/
│   │   │   │           └── route.ts
│   │   │   ├── upload/
│   │   │   │   └── route.ts
│   │   │   └── v1/
│   │   │       ├── shows/
│   │   │       │   └── [showId]/
│   │   │       │       └── subscribers/
│   │   │       │           └── route.ts
│   │   │       └── subscribers/
│   │   │           └── [id]/
│   │   │               └── route.ts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/ (Shadcn components)
│   │   ├── forms/
│   │   │   ├── show-form.tsx
│   │   │   └── episode-form.tsx
│   │   ├── dashboard/
│   │   │   ├── episode-list.tsx
│   │   │   ├── subscriber-list.tsx
│   │   │   ├── add-subscriber-dialog.tsx
│   │   │   └── show-card.tsx
│   │   └── file-upload.tsx
│   ├── lib/
│   │   ├── db.ts
│   │   ├── auth.ts
│   │   ├── feed-generator.ts
│   │   ├── r2.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── .env.local
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

---

## Environment Variables

```bash
# Database (Neon.tech)
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Authentication
ADMIN_PASSWORD="your-secure-password-here"

# Cloudflare R2
R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="xxx"
R2_SECRET_ACCESS_KEY="xxx"
R2_BUCKET="private-podcast"
R2_PUBLIC_URL="https://pub-xxx.r2.dev"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Neon database created (free tier)
- [ ] R2 bucket created with public access configured
- [ ] Environment variables configured in Vercel
- [ ] Database migrations run

### Post-Deployment
- [ ] Create first user account
- [ ] Test feed generation with podcast app
- [ ] Validate RSS at podba.se/validate
- [ ] Test webhook integration
- [ ] Verify audio files play correctly

---

## Future Enhancements (Post-MVP)

Features explicitly deferred:
- Date-Based feed type
- CSV bulk import
- Multi-user support (creator accounts)
- Advanced analytics dashboard
- Episode download tracking
- Zapier/Make integration
- Custom domain for feeds
- Subscriber self-service portal
- Dynamic audio insertion

---

## Notes & Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | Use Neon.tech instead of Supabase | User preference, serverless PostgreSQL, excellent Vercel integration |
| 2026-02-12 | Minimal password auth (env var) | Single admin user, simplest approach for MVP |
| 2026-02-12 | Remove Date-Based feed type | Not needed for initial use case |
| 2026-02-12 | Keep webhook API | Critical for marketing stack integration |
| 2026-02-12 | Use Cloudflare R2 | User preference, no egress fees |
| 2026-02-12 | Deploy to Vercel | Best Next.js DX, free tier, auto deployments |

---

*Document created during MVP planning session - February 12, 2026*
