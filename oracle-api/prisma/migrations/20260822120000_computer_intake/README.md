# Computer intake migration runbook

This migration is additive and must be reviewed before applying to any shared or production database.

## Preflight

1. Take and verify a database backup/restore point.
2. Run `prisma migrate status` with the controlled `DIRECT_URL`.
3. Run the duplicate preflight query embedded at the start of `migration.sql`. It intentionally aborts when nonblank asset tags collide after trimming/case-folding.
4. Resolve duplicates with an approved, auditable data decision before rerunning. Do not silently rewrite tags.

## Apply and verify

Apply with `prisma migrate deploy`, then verify the new tables, foreign keys, and the `Asset_assetTag_nonblank_unique` index. Smoke-test draft save/resume, Admin branch submission, Super Admin global submission, and component reload.

## Restore and forward-fix

There is no automatic down migration. Restore the verified backup only under an approved incident procedure, or create a reviewed forward-fix migration. Preserve ActivityLog evidence and record the incident owner/reason.

Never apply this migration from the runtime pooler URL, and never run it automatically from application startup.
