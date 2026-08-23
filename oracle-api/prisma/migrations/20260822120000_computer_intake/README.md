# Phase 1 Computer Intake

Additive migration for typed computer profiles, repeatable RAM/storage components, observations, drafts, normalized asset-tag uniqueness, and asset purchase date.

Do not apply until a backup/restore drill and duplicate asset-tag review have passed. Rollback requires restoring the database backup or a separately approved down migration; do not drop these tables in production as an automatic rollback.

`preflight.sql` reports normalized duplicate tags and does not rewrite, merge, or delete records. Resolve each duplicate manually, record the decision, and rerun the report until it returns zero rows. The migration intentionally raises an error when nonblank normalized duplicates remain; there is no hidden automatic rewrite.
