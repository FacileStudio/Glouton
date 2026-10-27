-- Add COMPANY_CREATION to LeadSource enum
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'COMPANY_CREATION';

-- Table for tracking newly registered companies in France, UK, Germany
CREATE TABLE IF NOT EXISTS "CompanyCreation" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "country"          TEXT NOT NULL,
  "registrationId"   TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "legalForm"        TEXT,
  "activityCode"     TEXT,
  "activityLabel"    TEXT,
  "address"          TEXT,
  "city"             TEXT,
  "postalCode"       TEXT,
  "region"           TEXT,
  "capital"          DOUBLE PRECISION,
  "currency"         TEXT DEFAULT 'EUR',
  "directors"        JSONB,
  "sourceUrl"        TEXT,
  "publishedAt"      TIMESTAMPTZ(3) NOT NULL,
  "hasWebsite"       BOOLEAN NOT NULL DEFAULT false,
  "websiteUrl"       TEXT,
  "domain"           TEXT,
  "email"            TEXT,
  "phone"            TEXT,
  "enrichmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "convertedLeadId"  TEXT REFERENCES "Lead"("id") ON DELETE SET NULL,
  "convertedAt"      TIMESTAMPTZ(3),
  "scrapedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyCreation_registrationId_key" UNIQUE ("registrationId")
);

CREATE INDEX IF NOT EXISTS "CompanyCreation_country_idx" ON "CompanyCreation"("country");
CREATE INDEX IF NOT EXISTS "CompanyCreation_publishedAt_idx" ON "CompanyCreation"("publishedAt");
CREATE INDEX IF NOT EXISTS "CompanyCreation_hasWebsite_idx" ON "CompanyCreation"("hasWebsite");
CREATE INDEX IF NOT EXISTS "CompanyCreation_activityCode_idx" ON "CompanyCreation"("activityCode");
CREATE INDEX IF NOT EXISTS "CompanyCreation_postalCode_idx" ON "CompanyCreation"("postalCode");
CREATE INDEX IF NOT EXISTS "CompanyCreation_city_idx" ON "CompanyCreation"("city");
CREATE INDEX IF NOT EXISTS "CompanyCreation_country_publishedAt_idx" ON "CompanyCreation"("country", "publishedAt");
CREATE INDEX IF NOT EXISTS "CompanyCreation_scrapedAt_idx" ON "CompanyCreation"("scrapedAt");
