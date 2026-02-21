-- Drop the old unique constraint that doesn't account for teamId
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "unique_user_email";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "unique_user_domain_person";

-- Add new constraints that properly handle team vs personal context
-- For team leads: unique on (teamId, email) when teamId is not null
-- For personal leads: unique on (userId, email) when teamId is null
CREATE UNIQUE INDEX "Lead_team_email_unique"
ON "Lead" ("teamId", "email")
WHERE "teamId" IS NOT NULL AND "email" IS NOT NULL;

CREATE UNIQUE INDEX "Lead_user_email_unique"
ON "Lead" ("userId", "email")
WHERE "teamId" IS NULL AND "email" IS NOT NULL;

-- Same for domain + person combination
CREATE UNIQUE INDEX "Lead_team_domain_person_unique"
ON "Lead" ("teamId", "domain", "firstName", "lastName")
WHERE "teamId" IS NOT NULL AND "domain" IS NOT NULL;

CREATE UNIQUE INDEX "Lead_user_domain_person_unique"
ON "Lead" ("userId", "domain", "firstName", "lastName")
WHERE "teamId" IS NULL AND "domain" IS NOT NULL;
