CREATE TABLE IF NOT EXISTS "ArdoiseDelivery" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArdoiseDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArdoiseDelivery_receivedAt_idx" ON "ArdoiseDelivery"("receivedAt");
