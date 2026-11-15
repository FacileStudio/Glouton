-- The space's own prices, free text, so price recommendations can compare with them. Additive only.

ALTER TABLE "TeamProspectProfile" ADD COLUMN IF NOT EXISTS "ownPricing" TEXT;
