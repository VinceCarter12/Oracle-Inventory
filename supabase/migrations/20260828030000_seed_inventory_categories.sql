-- Keep the production category catalog aligned with the local inventory seed.
-- Idempotent: existing category rows with these canonical ids are updated;
-- unrelated/custom categories and assets are preserved.
INSERT INTO public."Category" ("id", "name", "createdAt")
VALUES
  ('cat-laptop', 'Laptop', CURRENT_TIMESTAMP),
  ('cat-desktop', 'Desktop', CURRENT_TIMESTAMP),
  ('cat-phone', 'Company Phone', CURRENT_TIMESTAMP),
  ('cat-monitor', 'Monitor', CURRENT_TIMESTAMP),
  ('cat-printer', 'Printer', CURRENT_TIMESTAMP),
  ('cat-network', 'Network Equipment', CURRENT_TIMESTAMP),
  ('cat-cctv', 'CCTV', CURRENT_TIMESTAMP),
  ('cat-nvr', 'NVR', CURRENT_TIMESTAMP),
  ('cat-ip-phone', 'IP Phone', CURRENT_TIMESTAMP),
  ('cat-peripheral', 'Peripheral', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET "name" = EXCLUDED."name";
