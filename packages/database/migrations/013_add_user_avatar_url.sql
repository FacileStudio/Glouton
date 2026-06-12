-- Add avatarUrl to User (populated from the OIDC "picture" claim on SSO login)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
