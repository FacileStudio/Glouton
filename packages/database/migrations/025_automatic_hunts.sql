-- Automatic hunts (phase H): a prospecting profile per space and repeating hunt schedules.
-- Additive only.

DO $$ BEGIN
  CREATE TYPE "HuntFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TeamProspectProfile" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeKey"         TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "teamId"           TEXT,
  "offerDescription" TEXT,
  "area"             TEXT,
  "targetCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "nafCodes"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  "keywords"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamProspectProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamProspectProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamProspectProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamProspectProfile_scopeKey_key" ON "TeamProspectProfile"("scopeKey");
CREATE INDEX IF NOT EXISTS "TeamProspectProfile_userId_idx" ON "TeamProspectProfile"("userId");
CREATE INDEX IF NOT EXISTS "TeamProspectProfile_teamId_idx" ON "TeamProspectProfile"("teamId");

CREATE TABLE IF NOT EXISTS "HuntSchedule" (
  "id"                   TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"               TEXT NOT NULL,
  "teamId"               TEXT,
  "name"                 TEXT NOT NULL,
  "huntType"             "HuntType" NOT NULL DEFAULT 'LOCAL_BUSINESS',
  "filters"              JSONB NOT NULL,
  "frequency"            "HuntFrequency" NOT NULL,
  "enabled"              BOOLEAN NOT NULL DEFAULT true,
  "nextRunAt"            TIMESTAMPTZ(3) NOT NULL,
  "lastRunAt"            TIMESTAMPTZ(3),
  "consecutiveFailures"  INTEGER NOT NULL DEFAULT 0,
  "pausedReason"         TEXT,
  "lastSessionId"        TEXT,
  "lastSettledSessionId" TEXT,
  "lastNewLeads"         INTEGER,
  "createdAt"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HuntSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HuntSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HuntSchedule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "HuntSchedule_userId_idx" ON "HuntSchedule"("userId");
CREATE INDEX IF NOT EXISTS "HuntSchedule_teamId_idx" ON "HuntSchedule"("teamId");
CREATE INDEX IF NOT EXISTS "HuntSchedule_enabled_nextRunAt_idx" ON "HuntSchedule"("enabled", "nextRunAt");

ALTER TABLE "HuntSession" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;
CREATE INDEX IF NOT EXISTS "HuntSession_scheduleId_idx" ON "HuntSession"("scheduleId");

DO $$ BEGIN
  ALTER TABLE "HuntSession" ADD CONSTRAINT "HuntSession_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "HuntSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
