-- Create TeamRole enum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- Create Team table
CREATE TABLE "Team" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hunterApiKey" TEXT,
    "apolloApiKey" TEXT,
    "snovApiKey" TEXT,
    "hasdataApiKey" TEXT,
    "contactoutApiKey" TEXT,
    "googleMapsApiKey" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFromName" TEXT,
    "smtpFromEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create TeamMember table
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_teamId_userId_key" UNIQUE ("teamId", "userId")
);

CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX "TeamMember_role_idx" ON "TeamMember"("role");

-- Add teamId to Lead table
ALTER TABLE "Lead"
ADD COLUMN "teamId" TEXT,
ADD CONSTRAINT "Lead_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Lead_teamId_idx" ON "Lead"("teamId");

-- Add teamId to HuntSession table
ALTER TABLE "HuntSession"
ADD COLUMN "teamId" TEXT,
ADD CONSTRAINT "HuntSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "HuntSession_teamId_idx" ON "HuntSession"("teamId");

-- Add teamId to AuditSession table
ALTER TABLE "AuditSession"
ADD COLUMN "teamId" TEXT,
ADD CONSTRAINT "AuditSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AuditSession_teamId_idx" ON "AuditSession"("teamId");

-- Add teamId to EmailOutreach table
ALTER TABLE "EmailOutreach"
ADD COLUMN "teamId" TEXT,
ADD CONSTRAINT "EmailOutreach_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "EmailOutreach_teamId_idx" ON "EmailOutreach"("teamId");
