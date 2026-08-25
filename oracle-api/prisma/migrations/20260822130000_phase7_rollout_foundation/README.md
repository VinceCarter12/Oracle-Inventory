# Phase 7 rollout foundation

Additive feature rollout tables only. Before applying: verify backup/restore evidence and migration parity. Do not run automatically at startup or against the runtime pooler URL.

Rollback is feature-off or a reviewed forward-fix migration; there is no automatic down migration. Preserve ActivityLog evidence and never store secrets in rollout reasons or metadata.
