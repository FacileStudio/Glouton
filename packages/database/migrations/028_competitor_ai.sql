-- Competitors phase D: AI summaries of page changes and extracted prices.
-- Additive only.

ALTER TABLE "PageChange" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
ALTER TABLE "PageChange" ADD COLUMN IF NOT EXISTS "aiSummaryAt" TIMESTAMPTZ(3);
CREATE INDEX IF NOT EXISTS "PageChange_aiSummaryAt_idx" ON "PageChange"("aiSummaryAt");

DO $$ BEGIN
  CREATE TYPE "CompetitorPricePeriod" AS ENUM ('ONE_TIME', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CompetitorPrice" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "competitorId"  TEXT NOT NULL,
  "watchedPageId" TEXT,
  "snapshotId"    TEXT,
  "name"          TEXT NOT NULL,
  "price"         DOUBLE PRECISION,
  "currency"      TEXT,
  "unit"          TEXT,
  "period"        "CompetitorPricePeriod",
  "sourceUrl"     TEXT NOT NULL,
  "position"      INTEGER NOT NULL DEFAULT 0,
  "extractedAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorPrice_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorPrice_watchedPageId_fkey" FOREIGN KEY ("watchedPageId") REFERENCES "WatchedPage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CompetitorPrice_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PageSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CompetitorPrice_competitorId_position_idx" ON "CompetitorPrice"("competitorId", "position");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_snapshotId_idx" ON "CompetitorPrice"("snapshotId");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_watchedPageId_idx" ON "CompetitorPrice"("watchedPageId");
