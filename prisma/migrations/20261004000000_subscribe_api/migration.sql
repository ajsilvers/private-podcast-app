-- AlterEnum
ALTER TYPE "FeedType" ADD VALUE 'DATED';

-- AlterTable
ALTER TABLE "shows" ADD COLUMN     "accepting_subscribers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slug" TEXT;

-- Backfill: existing shows get their id as slug (rename in the dashboard before issuing keys)
UPDATE "shows" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "shows" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "release_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscribers" ADD COLUMN     "external_ref" TEXT;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key_shows" (
    "api_key_id" TEXT NOT NULL,
    "show_id" TEXT NOT NULL,

    CONSTRAINT "api_key_shows_pkey" PRIMARY KEY ("api_key_id","show_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "shows_slug_key" ON "shows"("slug");

-- CreateIndex
CREATE INDEX "episodes_show_id_release_at_idx" ON "episodes"("show_id", "release_at");

-- AddForeignKey
ALTER TABLE "api_key_shows" ADD CONSTRAINT "api_key_shows_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_shows" ADD CONSTRAINT "api_key_shows_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "shows"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: already-published episodes get a stable publication date (createdAt is the best available evidence)
UPDATE "episodes" SET "published_at" = "created_at" WHERE "is_published" AND "published_at" IS NULL;

-- Normalize subscriber emails; abort rather than merge two subscribers
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "subscribers" GROUP BY "show_id", lower(trim("email")) HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'email normalization collision; reconcile manually before migrating'; END IF;
END $$;
UPDATE "subscribers" SET "email" = lower(trim("email"));
