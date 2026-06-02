-- Existing unverified rows represented incomplete registration requests.
-- The new flow stores those as pending_registrations and creates users only
-- after a valid email code is verified.
DELETE FROM "users" WHERE "emailVerified" = false;

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "zoneId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_registrations_email_idx" ON "pending_registrations"("email");

-- CreateIndex
CREATE INDEX "pending_registrations_email_usedAt_expiresAt_idx" ON "pending_registrations"("email", "usedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
