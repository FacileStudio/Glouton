-- Contacts hub: Company, Person, Activity, Suggestion, plus agent drafts on EmailOutreach.
-- Additive only: the legacy Lead table stays untouched.

DO $$ BEGIN
  CREATE TYPE "ContactStage" AS ENUM ('PROSPECT', 'CONTACTED', 'CLIENT', 'PARTNER', 'PERSONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ContactOrigin" AS ENUM ('HUNT', 'CSV', 'MANUAL', 'ARDOISE', 'COURRIER', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SuggestionKind" AS ENUM ('DRAFT', 'FOLLOW_UP', 'RESCORE', 'NEXT_ACTION', 'MATCH', 'IMPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';

CREATE TABLE IF NOT EXISTS "Company" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"           TEXT NOT NULL,
  "teamId"           TEXT,
  "name"             TEXT NOT NULL,
  "legalName"        TEXT,
  "domain"           TEXT,
  "website"          TEXT,
  "siret"            TEXT,
  "vatNumber"        TEXT,
  "addressLine"      TEXT,
  "postalCode"       TEXT,
  "city"             TEXT,
  "country"          TEXT,
  "category"         TEXT,
  "phones"           TEXT[],
  "emails"           TEXT[],
  "socialProfiles"   JSONB,
  "websiteAudit"     JSONB,
  "technologies"     TEXT[],
  "temperature"      "LeadStatus" NOT NULL DEFAULT 'COLD',
  "score"            INTEGER NOT NULL DEFAULT 0,
  "stage"            "ContactStage" NOT NULL DEFAULT 'PROSPECT',
  "origin"           "ContactOrigin" NOT NULL,
  "notes"            TEXT,
  "legacyLeadId"     TEXT,
  "ardoiseClientId"  TEXT,
  "ardoiseSyncedAt"  TIMESTAMPTZ(3),
  "ardoiseUpdatedAt" TIMESTAMPTZ(3),
  "deletedAt"        TIMESTAMPTZ(3),
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Company_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Company_legacyLeadId_key" ON "Company"("legacyLeadId");
CREATE UNIQUE INDEX IF NOT EXISTS "Company_ardoiseClientId_key" ON "Company"("ardoiseClientId");
CREATE INDEX IF NOT EXISTS "Company_userId_idx" ON "Company"("userId");
CREATE INDEX IF NOT EXISTS "Company_teamId_idx" ON "Company"("teamId");
CREATE INDEX IF NOT EXISTS "Company_domain_idx" ON "Company"("domain");
CREATE INDEX IF NOT EXISTS "Company_siret_idx" ON "Company"("siret");
CREATE INDEX IF NOT EXISTS "Company_stage_idx" ON "Company"("stage");
CREATE INDEX IF NOT EXISTS "Company_userId_createdAt_idx" ON "Company"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "Person" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"           TEXT NOT NULL,
  "teamId"           TEXT,
  "companyId"        TEXT,
  "firstName"        TEXT,
  "lastName"         TEXT,
  "email"            TEXT,
  "emails"           TEXT[],
  "phones"           TEXT[],
  "role"             TEXT,
  "notes"            TEXT,
  "stage"            "ContactStage" NOT NULL DEFAULT 'PROSPECT',
  "origin"           "ContactOrigin" NOT NULL,
  "isBillingContact" BOOLEAN NOT NULL DEFAULT false,
  "emailVerified"    BOOLEAN,
  "legacyLeadId"     TEXT,
  "deletedAt"        TIMESTAMPTZ(3),
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Person_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Person_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Person_email_idx" ON "Person"("email");
CREATE INDEX IF NOT EXISTS "Person_userId_idx" ON "Person"("userId");
CREATE INDEX IF NOT EXISTS "Person_teamId_idx" ON "Person"("teamId");
CREATE INDEX IF NOT EXISTS "Person_companyId_idx" ON "Person"("companyId");
CREATE INDEX IF NOT EXISTS "Person_legacyLeadId_idx" ON "Person"("legacyLeadId");

CREATE TABLE IF NOT EXISTS "Activity" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"     TEXT NOT NULL,
  "teamId"     TEXT,
  "companyId"  TEXT,
  "personId"   TEXT,
  "kind"       TEXT NOT NULL,
  "summary"    TEXT NOT NULL,
  "payload"    JSONB,
  "actor"      TEXT,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Activity_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Activity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Activity_companyId_occurredAt_idx" ON "Activity"("companyId", "occurredAt");
CREATE INDEX IF NOT EXISTS "Activity_personId_occurredAt_idx" ON "Activity"("personId", "occurredAt");
CREATE INDEX IF NOT EXISTS "Activity_userId_idx" ON "Activity"("userId");
CREATE INDEX IF NOT EXISTS "Activity_teamId_idx" ON "Activity"("teamId");

CREATE TABLE IF NOT EXISTS "Suggestion" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"    TEXT NOT NULL,
  "teamId"    TEXT,
  "companyId" TEXT,
  "personId"  TEXT,
  "kind"      "SuggestionKind" NOT NULL,
  "status"    "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
  "title"     TEXT NOT NULL,
  "body"      TEXT,
  "rationale" TEXT,
  "payload"   JSONB,
  "createdBy" TEXT NOT NULL,
  "decidedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Suggestion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Suggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Suggestion_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Suggestion_userId_status_idx" ON "Suggestion"("userId", "status");
CREATE INDEX IF NOT EXISTS "Suggestion_teamId_status_idx" ON "Suggestion"("teamId", "status");
CREATE INDEX IF NOT EXISTS "Suggestion_companyId_idx" ON "Suggestion"("companyId");
CREATE INDEX IF NOT EXISTS "Suggestion_personId_idx" ON "Suggestion"("personId");

ALTER TABLE "EmailOutreach" ALTER COLUMN "leadId" DROP NOT NULL;
ALTER TABLE "EmailOutreach" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "EmailOutreach" ADD COLUMN IF NOT EXISTS "personId" TEXT;
ALTER TABLE "EmailOutreach" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "EmailOutreach" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'HUMAN';
ALTER TABLE "EmailOutreach" ADD COLUMN IF NOT EXISTS "rationale" TEXT;
ALTER TABLE "EmailOutreach" ADD COLUMN IF NOT EXISTS "courrierAccountId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "EmailOutreach" ADD CONSTRAINT "EmailOutreach_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmailOutreach" ADD CONSTRAINT "EmailOutreach_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "EmailOutreach_personId_idx" ON "EmailOutreach"("personId");
CREATE INDEX IF NOT EXISTS "EmailOutreach_companyId_idx" ON "EmailOutreach"("companyId");
