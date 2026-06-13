-- Per-workspace outgoing webhooks (Nook notifications): each team selects
-- the application events it wants POSTed to its endpoint.
CREATE TABLE IF NOT EXISTS "TeamWebhook" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "teamId"    TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "name"      TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "events"    TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "TeamWebhook_teamId_idx" ON "TeamWebhook"("teamId");
