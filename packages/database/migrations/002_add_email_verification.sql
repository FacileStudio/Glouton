ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailVerificationMethod" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_emailVerified_idx" ON "Lead"("emailVerified");
