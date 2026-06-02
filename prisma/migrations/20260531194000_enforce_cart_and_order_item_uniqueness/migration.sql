-- 1) Deduplicate order_items by (orderId, productId) before adding uniqueness
WITH grouped AS (
  SELECT
    MIN(id) AS keep_id,
    "orderId",
    "productId",
    SUM(quantity)::int AS total_quantity,
    MAX(price) AS keep_price
  FROM "order_items"
  GROUP BY "orderId", "productId"
  HAVING COUNT(*) > 1
)
UPDATE "order_items" oi
SET
  quantity = g.total_quantity,
  price = g.keep_price
FROM grouped g
WHERE oi.id = g.keep_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "orderId", "productId" ORDER BY id) AS rn
  FROM "order_items"
)
DELETE FROM "order_items" oi
USING ranked r
WHERE oi.id = r.id
  AND r.rn > 1;

-- 2) Normalize duplicate carts per user (legacy data cleanup)
CREATE TEMP TABLE tmp_cart_keep AS
SELECT
  "userId",
  MIN(id) AS keep_order_id
FROM "orders"
WHERE status = 'cart'
GROUP BY "userId";

CREATE TEMP TABLE tmp_cart_item_agg AS
SELECT
  o."userId",
  k.keep_order_id,
  oi."productId",
  SUM(oi.quantity)::int AS total_quantity,
  MAX(oi.price) AS keep_price,
  MIN(oi."createdAt") AS keep_created_at
FROM "orders" o
JOIN tmp_cart_keep k
  ON k."userId" = o."userId"
JOIN "order_items" oi
  ON oi."orderId" = o.id
WHERE o.status = 'cart'
GROUP BY o."userId", k.keep_order_id, oi."productId";

DELETE FROM "order_items" oi
USING "orders" o
WHERE oi."orderId" = o.id
  AND o.status = 'cart';

INSERT INTO "order_items" ("orderId", "productId", quantity, price, "createdAt")
SELECT
  keep_order_id,
  "productId",
  total_quantity,
  keep_price,
  keep_created_at
FROM tmp_cart_item_agg;

DELETE FROM "orders" o
USING tmp_cart_keep k
WHERE o.status = 'cart'
  AND o."userId" = k."userId"
  AND o.id <> k.keep_order_id;

UPDATE "orders" o
SET
  total = COALESCE(t.total_value, 0),
  "updatedAt" = NOW()
FROM (
  SELECT
    "orderId",
    SUM(quantity * price) AS total_value
  FROM "order_items"
  GROUP BY "orderId"
) t
WHERE o.id = t."orderId"
  AND o.status = 'cart';

UPDATE "orders"
SET
  total = 0,
  "updatedAt" = NOW()
WHERE status = 'cart'
  AND id NOT IN (
    SELECT DISTINCT "orderId"
    FROM "order_items"
  );

DROP TABLE IF EXISTS tmp_cart_item_agg;
DROP TABLE IF EXISTS tmp_cart_keep;

-- 3) Enforce uniqueness for order items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'order_items_orderId_productId_key'
  ) THEN
    CREATE UNIQUE INDEX "order_items_orderId_productId_key"
      ON "order_items" ("orderId", "productId");
  END IF;
END $$;

-- 4) Enforce one cart per user (partial unique index)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'orders_single_cart_per_user_idx'
  ) THEN
    CREATE UNIQUE INDEX "orders_single_cart_per_user_idx"
      ON "orders" ("userId")
      WHERE status = 'cart';
  END IF;
END $$;
