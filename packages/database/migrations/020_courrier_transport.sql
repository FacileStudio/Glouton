-- Mail transport choice per user and per team: COURRIER (with a Courrier account id) or SMTP.
-- Additive only: a null mailTransport keeps today's SMTP behaviour.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mailTransport" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "courrierAccountId" INTEGER;

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "mailTransport" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "courrierAccountId" INTEGER;

CREATE INDEX IF NOT EXISTS "Suggestion_kind_status_idx" ON "Suggestion"("kind", "status");
