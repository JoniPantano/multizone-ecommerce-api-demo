CREATE TABLE "idempotency_requests" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "orderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_requests_userId_action_key_key"
ON "idempotency_requests"("userId", "action", "key");

CREATE INDEX "idempotency_requests_userId_action_idx"
ON "idempotency_requests"("userId", "action");

ALTER TABLE "idempotency_requests"
ADD CONSTRAINT "idempotency_requests_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idempotency_requests"
ADD CONSTRAINT "idempotency_requests_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
