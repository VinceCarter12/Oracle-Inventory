---
date: 2026-08-24
tags: [planning, release, handoff]
---

# Phase 5 Handoff and Remaining Release Plan

## Ownership

Claude owns a fresh, disabled Phase 5 implementation. Codex owns its review, merge, provider-side migration work, and production smoke after a clean Claude handoff.

## Starting Point

| Item | State | Owner |
|---|---|---|
| Frontend API-client fix | Merged as PR #19 | Complete |
| Existing `codex/phase5-release` worktree | Local reference only; not release-ready | Do not reuse as Claude base |
| Phase 3 Network / Phase 4 CCTV code | Merged; migrations not applied | Codex after Phase 5 review |
| Phase 5 migration | Not applied | Codex only after PR approval |
| Phase 6 pages/tests | Separate Claude lane | Claude |
| Phase 2 Belarc | Production-disabled pending license and retention approval | No release action |

## Phase 5 Contract for Claude

- Begin from current `origin/main`; do not cherry-pick the old Phase 5 candidate or modify Codex's local worktree.
- Keep `SERVERS_FIREWALL_ISP_ENABLED` off and require `servers.firewall.isp.v1`; create no rollout record.
- Use only canonical `/api/servers`, `/api/firewalls`, and `/api/isp-circuits` endpoints.
- Branchless non-SuperAdmin users get `403 BRANCH_SCOPE_REQUIRED`, never an unfiltered result.
- Firewall writes, shared-service policy, and cross-branch equipment writes are SuperAdmin-only.
- Domain/IP/gateway/circuit/topology/management-reference/secret-reference metadata needs `view_sensitive_network_fields` or redacted DTOs.
- Accept opaque `secretReferenceId` metadata only; reject credentials, raw rules/configs, VPN/PPPoE/Wi-Fi secrets, backup keys, tokens, and license keys without logging values.
- POST routes require idempotency replay/mismatch support. Updates/end/termination routes require `expectedUpdatedAt` CAS.
- Implement `/inventory/intake/server`, `/inventory/intake/firewall`, `/inventory/intake/isp`, plus accessible disabled/loading/empty/restricted/error/retry states.

## Handoff Evidence Required

| Area | Evidence |
|---|---|
| Backend | Prisma validation, API build, full tests, focused Phase 5 security/route tests |
| Security | Branchless and guessed-ID denial, sensitive masking, SuperAdmin-only operations, secret rejection, idempotency and stale-write tests |
| Frontend | `svelte-check`/build or exact environment limitation, plus route/state evidence |
| Migration | One reconciled additive Phase 5 migration with RLS and revoked `PUBLIC`/`anon`/`authenticated` grants; not applied |
| Delivery | Commit SHA, branch, PR, changed files, tests, and remaining blockers |

## Codex Release Sequence

1. Quality-review and merge Claude's Phase 5 PR only when all gates pass.
2. Confirm the Tokyo Supabase target and record a restorable backup/export.
3. Apply and verify Phase 3 Network migration, then Phase 4 CCTV/secret-reference migration, then Phase 5 migration. Verify schema, RLS, grants, permissions, and zero-row counts after each.
4. Deploy frontend/API with all expansion features disabled; smoke `/health`, `/ready`, login, role scope, and disabled responses.
5. Review and merge Claude's Phase 6 PR independently. Do not enable any feature until pilot approval and rollback ownership are recorded.

## Non-Goals

This plan does not authorize Belarc enablement, raw secret/config storage, automatic backfills, destructive rollback, or production data entry.

[[Home]] | [[Context]] | [[Planning/Phase-5-Servers-Firewall-ISP-Spec]] | [[Planning/Phase-6-Tools-and-Stock-Spec]]
