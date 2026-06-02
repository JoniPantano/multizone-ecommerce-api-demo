CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");
CREATE UNIQUE INDEX "product_images_productId_position_key" ON "product_images"("productId", "position");

ALTER TABLE "product_images"
ADD CONSTRAINT "product_images_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
