-- G2: the "find a job" usage. Job searches, found offers, applications,
-- CVs and the drafts Bulle writes from them. Additive only.

DO $$ BEGIN
  CREATE TYPE "JobOfferStatus" AS ENUM ('NEW', 'SAVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "JobApplicationStatus" AS ENUM ('TO_APPLY', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "JobDraftKind" AS ENUM ('CV', 'LETTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "JobSearch" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"     TEXT NOT NULL,
  "teamId"     TEXT,
  "name"       TEXT NOT NULL,
  "role"       TEXT NOT NULL,
  "skills"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "location"   TEXT,
  "remote"     BOOLEAN NOT NULL DEFAULT false,
  "contracts"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "salaryMin"  INTEGER,
  "frequency"  "HuntFrequency",
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "nextRunAt"  TIMESTAMPTZ(3),
  "status"     TEXT,
  "queuedAt"   TIMESTAMPTZ(3),
  "lastRunAt"  TIMESTAMPTZ(3),
  "lastResult" JSONB,
  "createdAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobSearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobSearch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobSearch_userId_idx" ON "JobSearch"("userId");
CREATE INDEX IF NOT EXISTS "JobSearch_teamId_idx" ON "JobSearch"("teamId");
CREATE INDEX IF NOT EXISTS "JobSearch_nextRunAt_idx" ON "JobSearch"("nextRunAt");

CREATE TABLE IF NOT EXISTS "JobOffer" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeKey"    TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "teamId"      TEXT,
  "searchId"    TEXT,
  "source"      TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "company"     TEXT,
  "location"    TEXT,
  "remote"      BOOLEAN NOT NULL DEFAULT false,
  "contract"    TEXT,
  "salaryMin"   DOUBLE PRECISION,
  "salaryMax"   DOUBLE PRECISION,
  "currency"    TEXT,
  "salaryText"  TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "skills"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "postedAt"    TIMESTAMPTZ(3),
  "score"       INTEGER NOT NULL DEFAULT 0,
  "status"      "JobOfferStatus" NOT NULL DEFAULT 'NEW',
  "seenAt"      TIMESTAMPTZ(3),
  "decidedAt"   TIMESTAMPTZ(3),
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobOffer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobOffer_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "JobSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobOffer_scopeKey_url_key" ON "JobOffer"("scopeKey", "url");
CREATE INDEX IF NOT EXISTS "JobOffer_userId_idx" ON "JobOffer"("userId");
CREATE INDEX IF NOT EXISTS "JobOffer_teamId_idx" ON "JobOffer"("teamId");
CREATE INDEX IF NOT EXISTS "JobOffer_searchId_idx" ON "JobOffer"("searchId");
CREATE INDEX IF NOT EXISTS "JobOffer_scopeKey_status_score_idx" ON "JobOffer"("scopeKey", "status", "score");

CREATE TABLE IF NOT EXISTS "JobApplication" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"       TEXT NOT NULL,
  "teamId"       TEXT,
  "offerId"      TEXT,
  "title"        TEXT NOT NULL,
  "company"      TEXT,
  "url"          TEXT,
  "location"     TEXT,
  "description"  TEXT,
  "status"       "JobApplicationStatus" NOT NULL DEFAULT 'TO_APPLY',
  "appliedAt"    TIMESTAMPTZ(3),
  "interviewAt"  TIMESTAMPTZ(3),
  "offerAt"      TIMESTAMPTZ(3),
  "rejectedAt"   TIMESTAMPTZ(3),
  "notes"        TEXT,
  "contactName"  TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "links"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "remindAt"     TIMESTAMPTZ(3),
  "remindedAt"   TIMESTAMPTZ(3),
  "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobApplication_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobApplication_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "JobOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobApplication_userId_idx" ON "JobApplication"("userId");
CREATE INDEX IF NOT EXISTS "JobApplication_teamId_idx" ON "JobApplication"("teamId");
CREATE INDEX IF NOT EXISTS "JobApplication_offerId_idx" ON "JobApplication"("offerId");
CREATE INDEX IF NOT EXISTS "JobApplication_remindAt_idx" ON "JobApplication"("remindAt");

CREATE TABLE IF NOT EXISTS "JobCv" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"    TEXT NOT NULL,
  "teamId"    TEXT,
  "name"      TEXT NOT NULL,
  "fileName"  TEXT,
  "mimeType"  TEXT,
  "size"      INTEGER,
  "file"      BYTEA,
  "text"      TEXT,
  "shared"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobCv_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobCv_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobCv_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobCv_userId_idx" ON "JobCv"("userId");
CREATE INDEX IF NOT EXISTS "JobCv_teamId_idx" ON "JobCv"("teamId");

CREATE TABLE IF NOT EXISTS "JobDraft" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"        TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "cvId"          TEXT,
  "kind"          "JobDraftKind" NOT NULL,
  "language"      TEXT NOT NULL,
  "content"       TEXT NOT NULL,
  "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobDraft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobDraft_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "JobCv"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobDraft_applicationId_userId_kind_key" ON "JobDraft"("applicationId", "userId", "kind");
CREATE INDEX IF NOT EXISTS "JobDraft_userId_idx" ON "JobDraft"("userId");
CREATE INDEX IF NOT EXISTS "JobDraft_cvId_idx" ON "JobDraft"("cvId");
