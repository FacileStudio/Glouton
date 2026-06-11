-- Add new opportunity sources for the upgraded scraper
-- Note: migrate.sh applies each statement in autocommit mode (psql -f),
-- so ALTER TYPE ... ADD VALUE followed by UPDATE using the new value is safe.

ALTER TYPE "OpportunitySource" ADD VALUE IF NOT EXISTS 'FREE_WORK';
ALTER TYPE "OpportunitySource" ADD VALUE IF NOT EXISTS 'JOBICY';
ALTER TYPE "OpportunitySource" ADD VALUE IF NOT EXISTS 'HIMALAYAS';
ALTER TYPE "OpportunitySource" ADD VALUE IF NOT EXISTS 'HACKER_NEWS';
ALTER TYPE "OpportunitySource" ADD VALUE IF NOT EXISTS 'REMOTEOK';

-- Migrate rows written by earlier scraper versions that reused existing enum values
UPDATE "Opportunity" SET "sourcePlatform" = 'REMOTEOK' WHERE "sourcePlatform" = 'REMOTE_CO';
UPDATE "Opportunity" SET "sourcePlatform" = 'HACKER_NEWS' WHERE "sourcePlatform" = 'LINKEDIN';
