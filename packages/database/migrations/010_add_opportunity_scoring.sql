ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "relevanceScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Opportunity_relevanceScore_idx" ON "Opportunity"("relevanceScore");
