-- Competitors phase B: competitor discovery suggestions and the BODACC watch.
-- Additive only. Depends on 024 (Competitor) and 025 (TeamProspectProfile).

ALTER TABLE "TeamProspectProfile" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "TeamProspectProfile" ADD COLUMN IF NOT EXISTS "ownCategory" TEXT;

DO $$ BEGIN
  CREATE TYPE "CompetitorSuggestionSource" AS ENUM ('SONAR_WEB', 'SONAR_SIMILAR', 'OSM', 'BODACC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitorSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CompetitorSuggestion" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeKey"     TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "teamId"       TEXT,
  "name"         TEXT NOT NULL,
  "domain"       TEXT,
  "website"      TEXT,
  "area"         TEXT,
  "siren"        TEXT,
  "source"       "CompetitorSuggestionSource" NOT NULL,
  "sources"      "CompetitorSuggestionSource"[],
  "evidence"     JSONB NOT NULL DEFAULT '[]',
  "score"        INTEGER NOT NULL DEFAULT 0,
  "scoreParts"   JSONB NOT NULL DEFAULT '{}',
  "distanceKm"   DOUBLE PRECISION,
  "status"       "CompetitorSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "competitorId" TEXT,
  "seenAt"       TIMESTAMPTZ(3),
  "decidedAt"    TIMESTAMPTZ(3),
  "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorSuggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorSuggestion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorSuggestion_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorSuggestion_scopeKey_domain_key" ON "CompetitorSuggestion"("scopeKey", "domain");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorSuggestion_scopeKey_siren_key" ON "CompetitorSuggestion"("scopeKey", "siren");
CREATE INDEX IF NOT EXISTS "CompetitorSuggestion_userId_idx" ON "CompetitorSuggestion"("userId");
CREATE INDEX IF NOT EXISTS "CompetitorSuggestion_teamId_idx" ON "CompetitorSuggestion"("teamId");
CREATE INDEX IF NOT EXISTS "CompetitorSuggestion_scopeKey_status_score_idx" ON "CompetitorSuggestion"("scopeKey", "status", "score");

CREATE TABLE IF NOT EXISTS "CompetitorDiscoveryState" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeKey"     TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "teamId"       TEXT,
  "status"       TEXT,
  "queuedAt"     TIMESTAMPTZ(3),
  "lastRunAt"    TIMESTAMPTZ(3),
  "lastResult"   JSONB,
  "nextRunAt"    TIMESTAMPTZ(3),
  "bodaccCursor" TIMESTAMPTZ(3),
  "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorDiscoveryState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorDiscoveryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorDiscoveryState_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorDiscoveryState_scopeKey_key" ON "CompetitorDiscoveryState"("scopeKey");
CREATE INDEX IF NOT EXISTS "CompetitorDiscoveryState_userId_idx" ON "CompetitorDiscoveryState"("userId");
CREATE INDEX IF NOT EXISTS "CompetitorDiscoveryState_teamId_idx" ON "CompetitorDiscoveryState"("teamId");
CREATE INDEX IF NOT EXISTS "CompetitorDiscoveryState_nextRunAt_idx" ON "CompetitorDiscoveryState"("nextRunAt");
