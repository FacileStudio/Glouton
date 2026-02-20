-- Add composite index for duplicate checking during hunts
-- This helps with the query in local-business-hunt.worker.ts that checks existing leads
CREATE INDEX IF NOT EXISTS "Lead_userId_email_domain_name_idx"
ON "Lead"("userId", "email", "domain", "firstName", "lastName");

-- Add index for createdAt DESC queries (default sorting in leads list)
CREATE INDEX IF NOT EXISTS "Lead_userId_createdAt_idx"
ON "Lead"("userId", "createdAt" DESC);

-- Add composite index for common filter combinations
CREATE INDEX IF NOT EXISTS "Lead_userId_status_createdAt_idx"
ON "Lead"("userId", "status", "createdAt" DESC);
