-- Link each team to the Registre shared space it mirrors (null until the first directory sync)
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "registreSpaceId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Team_registreSpaceId_key" ON "Team"("registreSpaceId");
