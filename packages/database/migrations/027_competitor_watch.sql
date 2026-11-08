-- Competitors phase C: website monitoring of competitor pages.
-- Additive only.

DO $$ BEGIN
  CREATE TYPE "WatchedPageKind" AS ENUM ('PRICING', 'OFFER', 'BLOG', 'JOBS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WatchedPage" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "competitorId"  TEXT NOT NULL,
  "url"           TEXT NOT NULL,
  "selector"      TEXT,
  "kind"          "WatchedPageKind" NOT NULL DEFAULT 'OTHER',
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "thresholdPct"  INTEGER NOT NULL DEFAULT 5,
  "lastCheckedAt" TIMESTAMPTZ(3),
  "lastStatus"    TEXT,
  "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WatchedPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WatchedPage_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WatchedPage_competitorId_idx" ON "WatchedPage"("competitorId");
CREATE INDEX IF NOT EXISTS "WatchedPage_enabled_lastCheckedAt_idx" ON "WatchedPage"("enabled", "lastCheckedAt");

CREATE TABLE IF NOT EXISTS "PageSnapshot" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "watchedPageId" TEXT NOT NULL,
  "text"          TEXT NOT NULL,
  "hash"          TEXT NOT NULL,
  "fetchedAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PageSnapshot_watchedPageId_fkey" FOREIGN KEY ("watchedPageId") REFERENCES "WatchedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PageSnapshot_watchedPageId_fetchedAt_idx" ON "PageSnapshot"("watchedPageId", "fetchedAt");

CREATE TABLE IF NOT EXISTS "PageChange" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "watchedPageId" TEXT NOT NULL,
  "diff"          JSONB NOT NULL DEFAULT '[]',
  "changeRatio"   DOUBLE PRECISION NOT NULL,
  "addedLines"    INTEGER NOT NULL DEFAULT 0,
  "removedLines"  INTEGER NOT NULL DEFAULT 0,
  "seen"          BOOLEAN NOT NULL DEFAULT false,
  "notifiedAt"    TIMESTAMPTZ(3),
  "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PageChange_watchedPageId_fkey" FOREIGN KEY ("watchedPageId") REFERENCES "WatchedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PageChange_watchedPageId_createdAt_idx" ON "PageChange"("watchedPageId", "createdAt");
CREATE INDEX IF NOT EXISTS "PageChange_watchedPageId_seen_idx" ON "PageChange"("watchedPageId", "seen");
CREATE INDEX IF NOT EXISTS "PageChange_notifiedAt_idx" ON "PageChange"("notifiedAt");
