-- Department Management: archival support and active-name uniqueness.
-- Preflight: an active trimmed, case-insensitive duplicate must be resolved
-- before this migration can safely establish the unique index.
ALTER TABLE "Department"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Department"
    WHERE "archivedAt" IS NULL
    GROUP BY LOWER(BTRIM("name"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add Department active-name uniqueness: resolve trimmed duplicate department names first.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Department_archivedAt_idx"
  ON "Department" ("archivedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Department_active_name_ci_key"
  ON "Department" (LOWER(BTRIM("name")))
  WHERE "archivedAt" IS NULL;

-- Rollback (only before application code depends on archivedAt):
-- DROP INDEX IF EXISTS "Department_active_name_ci_key";
-- DROP INDEX IF EXISTS "Department_archivedAt_idx";
-- ALTER TABLE "Department" DROP COLUMN IF EXISTS "archivedAt";
