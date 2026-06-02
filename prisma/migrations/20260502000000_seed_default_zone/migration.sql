INSERT INTO "zones" ("name", "description", "createdAt", "updatedAt")
SELECT 'Default Zone', 'Zona por defecto', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "zones");
