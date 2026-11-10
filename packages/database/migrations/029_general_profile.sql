-- G1: usages per space and free-form targets per usage.
-- Additive only. The old targetCategories, nafCodes, keywords and ownCategory
-- columns stay; the app maps them into targets when targets is empty.

ALTER TABLE "TeamProspectProfile" ADD COLUMN IF NOT EXISTS "usages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TeamProspectProfile" ADD COLUMN IF NOT EXISTS "remote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TeamProspectProfile" ADD COLUMN IF NOT EXISTS "targets" JSONB NOT NULL DEFAULT '{}';
