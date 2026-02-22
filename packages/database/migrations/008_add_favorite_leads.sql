-- Create UserFavoriteLeads junction table
CREATE TABLE "UserFavoriteLead" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavoriteLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFavoriteLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFavoriteLead_userId_leadId_key" UNIQUE ("userId", "leadId")
);

-- Create indexes for efficient querying
CREATE INDEX "UserFavoriteLead_userId_idx" ON "UserFavoriteLead"("userId");
CREATE INDEX "UserFavoriteLead_leadId_idx" ON "UserFavoriteLead"("leadId");
CREATE INDEX "UserFavoriteLead_userId_createdAt_idx" ON "UserFavoriteLead"("userId", "createdAt" DESC);
