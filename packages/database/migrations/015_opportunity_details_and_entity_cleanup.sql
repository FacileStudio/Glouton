-- Extra detail fields scraped from the sources (company logo, contract type,
-- experience level, mission duration).
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "companyLogo" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "contractType" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "experienceLevel" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "duration" TEXT;

-- Clean HTML entities left in data scraped before entity decoding was added
-- (e.g. tags like "Creative &amp; Design").
UPDATE "Opportunity"
SET "title" = replace(replace(replace(replace("title", '&amp;', '&'), '&#39;', ''''), '&quot;', '"'), '&#038;', '&')
WHERE "title" ~ '&(amp|quot|#39|#038);';

UPDATE "Opportunity"
SET "company" = replace(replace(replace(replace("company", '&amp;', '&'), '&#39;', ''''), '&quot;', '"'), '&#038;', '&')
WHERE "company" ~ '&(amp|quot|#39|#038);';

UPDATE "Opportunity"
SET "description" = replace(replace(replace(replace("description", '&amp;', '&'), '&#39;', ''''), '&quot;', '"'), '&#038;', '&')
WHERE "description" ~ '&(amp|quot|#39|#038);';

UPDATE "Opportunity"
SET "tags" = (
  SELECT coalesce(
    array_agg(replace(replace(replace(replace(t, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'), '&#038;', '&')),
    '{}'
  )
  FROM unnest("tags") AS t
)
WHERE EXISTS (SELECT 1 FROM unnest("tags") AS t WHERE t ~ '&(amp|quot|#39|#038);');
