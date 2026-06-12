-- Number of people already applying / bidding on the opportunity,
-- scraped from sources that expose it (e.g. Codeur.com "N offres").
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "applicantCount" INTEGER;
