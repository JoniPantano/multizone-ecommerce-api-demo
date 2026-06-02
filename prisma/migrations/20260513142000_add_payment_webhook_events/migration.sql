CREATE TABLE "payment_webhook_events" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT,
    "resourceId" TEXT,
    "payload" JSONB,
    "orderId" INTEGER,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_providerEventId_key" ON "payment_webhook_events"("providerEventId");
CREATE INDEX "payment_webhook_events_provider_resourceId_idx" ON "payment_webhook_events"("provider", "resourceId");

ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
