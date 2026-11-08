-- Competitors phase A: competitor cards with a battlecard, and win/loss fields on Lead.
-- Additive only.

DO $$ BEGIN
  CREATE TYPE "CompetitorStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadOutcome" AS ENUM ('WON', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadLossReason" AS ENUM ('LOST_TO_COMPETITOR', 'PRICE', 'NO_DECISION', 'NO_BUDGET', 'TIMING', 'FEATURES', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitorLossReason" AS ENUM ('PRICE', 'FEATURES', 'RELATIONSHIP', 'BRAND', 'TIMING', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Competitor" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"      TEXT NOT NULL,
  "teamId"      TEXT,
  "name"        TEXT NOT NULL,
  "website"     TEXT,
  "domain"      TEXT,
  "area"        TEXT,
  "nafCodes"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "tags"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes"       TEXT,
  "status"      "CompetitorStatus" NOT NULL DEFAULT 'ACTIVE',
  "overview"    TEXT,
  "whyWeWin"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "whyWeLose"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "objections"  JSONB NOT NULL DEFAULT '[]',
  "landmines"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "pricing"     TEXT,
  "proofPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Competitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Competitor_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Competitor_userId_idx" ON "Competitor"("userId");
CREATE INDEX IF NOT EXISTS "Competitor_teamId_idx" ON "Competitor"("teamId");
CREATE INDEX IF NOT EXISTS "Competitor_teamId_domain_idx" ON "Competitor"("teamId", "domain");
CREATE INDEX IF NOT EXISTS "Competitor_userId_domain_idx" ON "Competitor"("userId", "domain");

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "outcome" "LeadOutcome";
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lossReason" "LeadLossReason";
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lostToCompetitorId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "competitorLossReason" "CompetitorLossReason";
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "wonAgainstCompetitorId" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_lostToCompetitorId_idx" ON "Lead"("lostToCompetitorId");
CREATE INDEX IF NOT EXISTS "Lead_wonAgainstCompetitorId_idx" ON "Lead"("wonAgainstCompetitorId");

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_lostToCompetitorId_fkey" FOREIGN KEY ("lostToCompetitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_wonAgainstCompetitorId_fkey" FOREIGN KEY ("wonAgainstCompetitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
