-- Back-channel logout: a session token issued at or before this instant no longer verifies.
-- Kept in step with prisma/schema/user.prisma. Additive only.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMPTZ(3);
