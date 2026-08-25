# CCTV/NVR foundation migration

This migration is additive and stores only inventory metadata. It never stores camera/NVR passwords, stream URLs, footage, or exported configuration.

Before applying to a database:

1. Back up the database and verify the Phase 3 networking migration is present.
2. Preflight existing data for duplicate camera/recorder profiles and overlapping active channel assignments. The partial active-assignment indexes intentionally fail closed when duplicates exist; resolve duplicates with an approved forward fix first.
3. Apply in staging, verify branch/object authorization, idempotency replay/conflict, assignment conflict handling, and redacted ActivityLog rows.
4. Production application requires explicit approval. There is no automatic down migration; recover with a backup restore or a reviewed forward migration that preserves assignment history.

The `CCTV_NVR_ENABLED` server flag and `cctv.nvr.v1` rollout must both permit writes. Keep the feature disabled until the schema and permission seed are verified.
