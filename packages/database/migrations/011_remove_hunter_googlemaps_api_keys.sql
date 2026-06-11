-- Remove Hunter.io and Google Maps API key columns
-- All lead sources are now free (OpenStreetMap + public job boards)

ALTER TABLE "User" DROP COLUMN IF EXISTS "hunterApiKey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "googleMapsApiKey";

ALTER TABLE "Team" DROP COLUMN IF EXISTS "hunterApiKey";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "googleMapsApiKey";
