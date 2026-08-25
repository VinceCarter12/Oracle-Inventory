# Department management migration rollback

This migration is unapplied in the current environment. To roll it back before any dependent data is written, run:

```sql
DROP INDEX IF EXISTS "Department_active_name_ci_key";
DROP INDEX IF EXISTS "Department_archivedAt_idx";
ALTER TABLE "Department" DROP COLUMN IF EXISTS "archivedAt";
```

Do not run rollback against production without an approved backup and migration owner. A future forward migration must be created if this migration has already been applied.
