-- Remove unused API key columns from User and Team tables
-- Only keeping hunterApiKey and googleMapsApiKey

-- Remove from User table
ALTER TABLE "User" DROP COLUMN IF EXISTS "apolloApiKey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "snovApiKey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "hasdataApiKey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "contactoutApiKey";

-- Remove from Team table
ALTER TABLE "Team" DROP COLUMN IF EXISTS "apolloApiKey";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "snovApiKey";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "hasdataApiKey";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "contactoutApiKey";
