-- Price history and alerts: every extraction is kept, with the events between two of them.
-- A watched pricing page that changed can start an extraction (PageChange.priceAttemptAt, priceStatus).
-- Kept in step with prisma/schema/competitor_ai.prisma and competitor_watch.prisma. Additive only.

DO $$ BEGIN
  CREATE TYPE "PriceEventKind" AS ENUM ('PRICE_CHANGED', 'PLAN_ADDED', 'PLAN_REMOVED', 'FREE_TIER_APPEARED', 'FREE_TIER_REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PriceExtraction" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "competitorId" TEXT NOT NULL,
  "trigger"      TEXT NOT NULL DEFAULT 'manual',
  "changeId"     TEXT,
  "extractedAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceExtraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriceExtraction_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PriceExtraction_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "PageChange"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PriceExtraction_competitorId_extractedAt_idx" ON "PriceExtraction"("competitorId", "extractedAt");
CREATE INDEX IF NOT EXISTS "PriceExtraction_changeId_idx" ON "PriceExtraction"("changeId");

CREATE TABLE IF NOT EXISTS "PriceEvent" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "competitorId" TEXT NOT NULL,
  "extractionId" TEXT NOT NULL,
  "kind"         "PriceEventKind" NOT NULL,
  "plan"         TEXT NOT NULL,
  "oldPrice"     DOUBLE PRECISION,
  "newPrice"     DOUBLE PRECISION,
  "currency"     TEXT,
  "period"       "CompetitorPricePeriod",
  "percent"      DOUBLE PRECISION,
  "notifiedAt"   TIMESTAMPTZ(3),
  "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriceEvent_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PriceEvent_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "PriceExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PriceEvent_competitorId_createdAt_idx" ON "PriceEvent"("competitorId", "createdAt");
CREATE INDEX IF NOT EXISTS "PriceEvent_extractionId_idx" ON "PriceEvent"("extractionId");
CREATE INDEX IF NOT EXISTS "PriceEvent_notifiedAt_idx" ON "PriceEvent"("notifiedAt");

ALTER TABLE "CompetitorPrice" ADD COLUMN IF NOT EXISTS "extractionId" TEXT;
DO $$ BEGIN
  ALTER TABLE "CompetitorPrice" ADD CONSTRAINT "CompetitorPrice_extractionId_fkey"
    FOREIGN KEY ("extractionId") REFERENCES "PriceExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "CompetitorPrice_extractionId_idx" ON "CompetitorPrice"("extractionId");

INSERT INTO "PriceExtraction" ("competitorId", "trigger", "extractedAt")
SELECT p."competitorId", 'manual', MAX(p."extractedAt")
FROM "CompetitorPrice" p
WHERE p."extractionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "PriceExtraction" e WHERE e."competitorId" = p."competitorId")
GROUP BY p."competitorId";

UPDATE "CompetitorPrice" p
SET "extractionId" = e."id"
FROM "PriceExtraction" e
WHERE p."extractionId" IS NULL AND e."competitorId" = p."competitorId";

ALTER TABLE "PageChange" ADD COLUMN IF NOT EXISTS "priceAttemptAt" TIMESTAMPTZ(3);
ALTER TABLE "PageChange" ADD COLUMN IF NOT EXISTS "priceStatus" TEXT;
CREATE INDEX IF NOT EXISTS "PageChange_priceAttemptAt_idx" ON "PageChange"("priceAttemptAt");
