-- Plan entitlements pushed by Registre in the directory snapshot (porte/forfait contract)
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "entitlements" JSONB;

CREATE TABLE IF NOT EXISTS "PersonEntitlement" (
  "sub" TEXT NOT NULL,
  "entitlements" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonEntitlement_pkey" PRIMARY KEY ("sub")
);

CREATE TABLE IF NOT EXISTS "ForfaitState" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "issuer" TEXT NOT NULL,
  "version" BIGINT NOT NULL,
  "revision" BIGINT NOT NULL,
  "firstAppliedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAppliedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForfaitState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ForfaitState_singleton" CHECK ("id" = 1)
);
