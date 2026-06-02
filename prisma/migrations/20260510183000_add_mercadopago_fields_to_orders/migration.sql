ALTER TABLE "orders"
ADD COLUMN "paymentProvider" TEXT DEFAULT 'mercadopago',
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'pending_payment',
ADD COLUMN "mpPreferenceId" TEXT,
ADD COLUMN "mpPaymentId" TEXT,
ADD COLUMN "mpMerchantOrderId" TEXT,
ADD COLUMN "mpExternalReference" TEXT,
ADD COLUMN "mpInitPoint" TEXT,
ADD COLUMN "paymentUpdatedAt" TIMESTAMP(3);
