# Phase 5 shared policy and address overlap

This forward-only migration adds explicit, fail-closed shared-service eligibility to ISP circuits and durable approval metadata to equipment assignments.

Before applying, back up the database and verify existing rows. Address interval overlap is currently protected by a serializable transaction plus an overlap predicate. A PostgreSQL exclusion constraint is intentionally not applied automatically because it requires the `btree_gist` extension and an operator-approved extension change. If concurrency guarantees stronger than the API transaction are required, review existing data, enable `btree_gist`, then apply the documented exclusion constraint in the migration SQL.

There is no automatic down migration. Restore from backup or prepare a reviewed forward-fix migration.
