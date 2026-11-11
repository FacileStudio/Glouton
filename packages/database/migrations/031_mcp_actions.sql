-- Pending MCP actions (tronc PENDING_SCHEMA), kept in step with prisma/schema/mcp.prisma.
-- Additive only.

CREATE TABLE IF NOT EXISTS mcp_actions (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  kind        TEXT        NOT NULL,
  target      TEXT        NOT NULL,
  digest      TEXT        NOT NULL,
  summary     TEXT        NOT NULL DEFAULT '',
  client_id   TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  outcome     TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "mcp_actions_user_id_created_at_idx" ON mcp_actions (user_id, created_at DESC);
