-- Enums

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "HuntStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "HuntType" AS ENUM ('DOMAIN', 'LOCAL_BUSINESS');
CREATE TYPE "LeadStatus" AS ENUM ('HOT', 'WARM', 'COLD');
CREATE TYPE "LeadSource" AS ENUM ('HUNTER', 'APOLLO', 'SNOV', 'HASDATA', 'CONTACTOUT', 'MANUAL', 'GOOGLE_MAPS', 'OPENSTREETMAP');
CREATE TYPE "BusinessType" AS ENUM ('DOMAIN', 'LOCAL_BUSINESS');
CREATE TYPE "EventLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'SUCCESS');
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'FAILED');
CREATE TYPE "OpportunitySource" AS ENUM ('MALT', 'CODEUR', 'FREELANCE_INFORMATIQUE', 'COMET', 'LE_HIBOU', 'UPWORK', 'FIVERR', 'FREELANCER', 'TOPTAL', 'WE_WORK_REMOTELY', 'REMOTE_CO', 'REMOTIVE', 'LINKEDIN', 'INDEED', 'GURU', 'PEOPLEPERHOUR');
CREATE TYPE "OpportunityCategory" AS ENUM ('WEB_DEVELOPMENT', 'WEB_DESIGN', 'MOBILE_DEVELOPMENT', 'UI_UX_DESIGN', 'FRONTEND', 'BACKEND', 'FULLSTACK', 'DEVOPS', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'BLOCKCHAIN', 'GAME_DEVELOPMENT', 'WORDPRESS', 'ECOMMERCE', 'SEO', 'CONTENT_WRITING', 'COPYWRITING', 'GRAPHIC_DESIGN', 'VIDEO_EDITING', 'MARKETING', 'CONSULTING', 'OTHER');

-- Tables

CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "bannedBy" TEXT,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedUntil" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "hunterApiKey" TEXT,
    "apolloApiKey" TEXT,
    "snovApiKey" TEXT,
    "hasdataApiKey" TEXT,
    "contactoutApiKey" TEXT,
    "googleMapsApiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_isBanned_idx" ON "User"("isBanned");
CREATE INDEX "User_emailVerified_idx" ON "User"("emailVerified");

CREATE TABLE "Contact" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Verification" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "hashedIdentifier" TEXT NOT NULL,
    "hashedValue" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Verification_hashedIdentifier_hashedValue_key" UNIQUE ("hashedIdentifier", "hashedValue")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE TABLE "Account" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Account_providerId_accountId_key" UNIQUE ("providerId", "accountId")
);

CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE TABLE "AdminPermission" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminPermission_userId_entity_key" UNIQUE ("userId", "entity")
);

CREATE INDEX "AdminPermission_userId_idx" ON "AdminPermission"("userId");
CREATE INDEX "AdminPermission_entity_idx" ON "AdminPermission"("entity");

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "AuditSession" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT UNIQUE,
    "leadId" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "processedLeads" INTEGER NOT NULL DEFAULT 0,
    "updatedLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "currentDomain" TEXT,
    "lastProcessedIndex" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AuditSession_userId_idx" ON "AuditSession"("userId");
CREATE INDEX "AuditSession_status_idx" ON "AuditSession"("status");
CREATE INDEX "AuditSession_jobId_idx" ON "AuditSession"("jobId");

CREATE TABLE "HuntSession" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT UNIQUE,
    "huntType" "HuntType" NOT NULL DEFAULT 'DOMAIN',
    "sources" "LeadSource"[] NOT NULL DEFAULT '{}',
    "domain" TEXT,
    "filters" JSONB,
    "status" "HuntStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "successfulLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "sourceStats" JSONB,
    "error" TEXT,
    "lastProcessedIndex" INTEGER,
    "currentDomain" TEXT,
    "currentSource" "LeadSource",
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HuntSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HuntSession_userId_idx" ON "HuntSession"("userId");
CREATE INDEX "HuntSession_status_idx" ON "HuntSession"("status");
CREATE INDEX "HuntSession_huntType_idx" ON "HuntSession"("huntType");
CREATE INDEX "HuntSession_jobId_idx" ON "HuntSession"("jobId");

CREATE TABLE "HuntSessionEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "huntSessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "EventLevel" NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HuntSessionEvent_huntSessionId_fkey" FOREIGN KEY ("huntSessionId") REFERENCES "HuntSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HuntSessionEvent_huntSessionId_idx" ON "HuntSessionEvent"("huntSessionId");
CREATE INDEX "HuntSessionEvent_level_idx" ON "HuntSessionEvent"("level");
CREATE INDEX "HuntSessionEvent_category_idx" ON "HuntSessionEvent"("category");
CREATE INDEX "HuntSessionEvent_timestamp_idx" ON "HuntSessionEvent"("timestamp");

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'HUNTER',
    "sourceId" TEXT,
    "businessType" "BusinessType" NOT NULL DEFAULT 'DOMAIN',
    "domain" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "position" TEXT,
    "department" TEXT,
    "businessName" TEXT,
    "category" TEXT,
    "coordinates" JSONB,
    "openingHours" TEXT,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT true,
    "city" TEXT,
    "country" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'COLD',
    "score" INTEGER NOT NULL DEFAULT 0,
    "technologies" TEXT[] NOT NULL DEFAULT '{}',
    "additionalEmails" TEXT[] NOT NULL DEFAULT '{}',
    "phoneNumbers" TEXT[] NOT NULL DEFAULT '{}',
    "physicalAddresses" TEXT[] NOT NULL DEFAULT '{}',
    "socialProfiles" JSONB,
    "companyInfo" JSONB,
    "websiteAudit" JSONB,
    "scrapedAt" TIMESTAMP(3),
    "auditedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "huntSessionId" TEXT,
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "lastContactedAt" TIMESTAMP(3),
    "emailsSentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "unique_user_email" UNIQUE ("userId", "email"),
    CONSTRAINT "unique_user_domain_person" UNIQUE ("userId", "domain", "firstName", "lastName")
);

CREATE INDEX "Lead_userId_idx" ON "Lead"("userId");
CREATE INDEX "Lead_huntSessionId_idx" ON "Lead"("huntSessionId");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_source_idx" ON "Lead"("source");
CREATE INDEX "Lead_contacted_idx" ON "Lead"("contacted");
CREATE INDEX "Lead_businessType_idx" ON "Lead"("businessType");
CREATE INDEX "Lead_category_idx" ON "Lead"("category");
CREATE INDEX "Lead_country_idx" ON "Lead"("country");
CREATE INDEX "Lead_city_idx" ON "Lead"("city");
CREATE INDEX "Lead_userId_status_createdAt_idx" ON "Lead"("userId", "status", "createdAt");
CREATE INDEX "Lead_userId_sourceId_idx" ON "Lead"("userId", "sourceId");
CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX "Lead_userId_domain_idx" ON "Lead"("userId", "domain");
CREATE INDEX "Lead_scrapedAt_idx" ON "Lead"("scrapedAt");
CREATE INDEX "Lead_auditedAt_idx" ON "Lead"("auditedAt");
CREATE INDEX "Lead_userId_scrapedAt_idx" ON "Lead"("userId", "scrapedAt");
CREATE INDEX "Lead_userId_auditedAt_idx" ON "Lead"("userId", "auditedAt");
CREATE INDEX "Lead_userId_businessName_idx" ON "Lead"("userId", "businessName");
CREATE INDEX "Lead_domain_idx" ON "Lead"("domain");

CREATE TABLE "EmailOutreach" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOutreach_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailOutreach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmailOutreach_leadId_idx" ON "EmailOutreach"("leadId");
CREATE INDEX "EmailOutreach_userId_idx" ON "EmailOutreach"("userId");
CREATE INDEX "EmailOutreach_status_idx" ON "EmailOutreach"("status");
CREATE INDEX "EmailOutreach_sentAt_idx" ON "EmailOutreach"("sentAt");

CREATE TABLE "Room" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "RoomParticipant" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomParticipant_userId_roomId_key" UNIQUE ("userId", "roomId")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Media" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL UNIQUE,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Subscription" (
    "id" SERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "stripeCustomerId" TEXT NOT NULL UNIQUE,
    "stripeSubscriptionId" TEXT UNIQUE,
    "status" TEXT NOT NULL,
    "planId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");

CREATE TABLE "PaymentHistory" (
    "id" SERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripePaymentId" TEXT NOT NULL UNIQUE,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PaymentHistory_userId_idx" ON "PaymentHistory"("userId");

CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "company" TEXT,
    "sourceId" TEXT NOT NULL UNIQUE,
    "sourcePlatform" "OpportunitySource" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "category" "OpportunityCategory" NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "budget" TEXT,
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "currency" TEXT,
    "location" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Opportunity_sourcePlatform_idx" ON "Opportunity"("sourcePlatform");
CREATE INDEX "Opportunity_category_idx" ON "Opportunity"("category");
CREATE INDEX "Opportunity_postedAt_idx" ON "Opportunity"("postedAt");
CREATE INDEX "Opportunity_scrapedAt_idx" ON "Opportunity"("scrapedAt");
CREATE INDEX "Opportunity_isRemote_idx" ON "Opportunity"("isRemote");
CREATE INDEX "Opportunity_sourcePlatform_createdAt_idx" ON "Opportunity"("sourcePlatform", "createdAt");
CREATE INDEX "Opportunity_category_postedAt_idx" ON "Opportunity"("category", "postedAt");
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

CREATE TABLE "OpportunitySearch" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "query" TEXT,
    "sources" "OpportunitySource"[] NOT NULL DEFAULT '{}',
    "categories" "OpportunityCategory"[] NOT NULL DEFAULT '{}',
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "minBudget" DOUBLE PRECISION,
    "maxBudget" DOUBLE PRECISION,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunitySearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OpportunitySearch_userId_idx" ON "OpportunitySearch"("userId");
CREATE INDEX "OpportunitySearch_createdAt_idx" ON "OpportunitySearch"("createdAt");

CREATE TABLE "OpportunityView" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedUrl" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OpportunityView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityView_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityView_userId_opportunityId_key" UNIQUE ("userId", "opportunityId")
);

CREATE INDEX "OpportunityView_userId_viewedAt_idx" ON "OpportunityView"("userId", "viewedAt");
CREATE INDEX "OpportunityView_opportunityId_idx" ON "OpportunityView"("opportunityId");

CREATE TABLE "UserOpportunityNotification" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserOpportunityNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserOpportunityNotification_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserOpportunityNotification_userId_opportunityId_key" UNIQUE ("userId", "opportunityId")
);

CREATE INDEX "UserOpportunityNotification_userId_idx" ON "UserOpportunityNotification"("userId");
CREATE INDEX "UserOpportunityNotification_opportunityId_idx" ON "UserOpportunityNotification"("opportunityId");

CREATE TABLE "UserOpportunityPreferences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "discordWebhook" TEXT,
    "enableDiscordNotifications" BOOLEAN NOT NULL DEFAULT false,
    "enabledSources" "OpportunitySource"[] NOT NULL DEFAULT '{"MALT","CODEUR","FREELANCE_INFORMATIQUE","COMET","LE_HIBOU","UPWORK","FIVERR","FREELANCER","TOPTAL","WE_WORK_REMOTELY","REMOTE_CO","REMOTIVE","LINKEDIN","INDEED","GURU","PEOPLEPERHOUR"}',
    "enabledCategories" "OpportunityCategory"[] NOT NULL DEFAULT '{"WEB_DEVELOPMENT","WEB_DESIGN","MOBILE_DEVELOPMENT","UI_UX_DESIGN","FRONTEND","BACKEND","FULLSTACK","DEVOPS","DATA_SCIENCE","MACHINE_LEARNING","BLOCKCHAIN","GAME_DEVELOPMENT","WORDPRESS","ECOMMERCE","SEO","CONTENT_WRITING","COPYWRITING","GRAPHIC_DESIGN","VIDEO_EDITING","MARKETING","CONSULTING","OTHER"}',
    "keywords" TEXT[] NOT NULL DEFAULT '{}',
    "excludeKeywords" TEXT[] NOT NULL DEFAULT '{}',
    "minBudget" DOUBLE PRECISION,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserOpportunityPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
