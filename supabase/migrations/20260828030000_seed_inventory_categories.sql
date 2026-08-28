-- Keep the production category catalog aligned with the local inventory seed.
-- Idempotent by category name because production may already have the same
-- category with a generated ID. Unrelated/custom categories and assets remain.
INSERT INTO public."Category" ("id", "name", "createdAt")
SELECT seed."id", seed."name", CURRENT_TIMESTAMP
FROM (VALUES
  ('cat-computer', 'Computer'),
  ('cat-laptop', 'Laptop'),
  ('cat-desktop', 'Desktop'),
  ('cat-phone', 'Company Phone'),
  ('cat-monitor', 'Monitor'),
  ('cat-printer', 'Printer'),
  ('cat-network', 'Network Equipment'),
  ('cat-cctv', 'CCTV'),
  ('cat-nvr', 'NVR'),
  ('cat-ip-phone', 'IP Phone'),
  ('cat-peripheral', 'Peripheral')
) AS seed("id", "name")
WHERE NOT EXISTS (
  SELECT 1
  FROM public."Category" existing
  WHERE existing."name" = seed."name"
)
ON CONFLICT ("id") DO UPDATE
SET "name" = EXCLUDED."name";
