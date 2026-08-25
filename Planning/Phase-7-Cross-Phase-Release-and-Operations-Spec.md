---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 7 Cross-Phase Release and Operations Spec

> Status: Implementation-ready candidate; not implemented.

This phase defines the release spine for Phases 2-6: additive migration order, feature flags, staging, pilot branch rollout, backup/restore, observability, rollback, audit evidence, security verification, and acceptance gates.

## Scope and Out of Scope

In scope: release sequencing, operational gates, migration compatibility, pilot rollout, observability, audit evidence, security verification, rollback patterns, and acceptance decisions.

Out of scope: direct deployment, provider configuration, environment variable edits, Supabase/Vercel changes, production DNS cutover, and app code changes in this planning batch.

## Field Dictionary and Cardinality

| Field | Entity | Type | Cardinality | Required | Notes |
|---|---|---|---|---|---|
| `key`, `enabledGlobally`, `status`, `minimumRole`, `configVersion`, `updatedById`, `updatedAt` | `FeatureRollout` | typed fields | one row per feature | yes/optional | Server-authoritative rollout control; an environment kill switch can still override it. |
| `featureKey`, `branchId`, `enabled`, timestamps | `FeatureRolloutBranch` | typed fields | many branch overrides per feature | conditional | Pilot scope; flags never replace permission/object authorization. |
| `migrationId` | migration ledger | string | one per migration | yes | Must map to Prisma/Supabase migration. |
| `backupEvidenceUri` | release evidence | reference | one per release | yes before production | Link/reference only; no secrets. |
| `restoreTestedAt` | release evidence | datetime | zero or one | yes before production | Required gate. |
| `rollbackPlan` | release evidence | text/link | one per phase | yes | Must state disable, revert, or forward-fix route. |
| `securityGateStatus` | release evidence | enum | one per mandatory gate | yes | `pending`, `passed`, `failed`; object/branch authorization, secret rejection/redaction, migration parity, and restore proof are non-waivable. |
| `exceptionStatus`, `exceptionApprover`, `exceptionReason`, `exceptionExpiresAt`, `compensatingControls` | non-security release exception | typed fields | zero or one active exception per eligible gate | no | Never applies to mandatory security/restore/migration gates. |
| `acceptanceOwner` | release evidence | user/reference | one per phase | yes | Human owner, not automated. |
| `acceptedAt` | release evidence | datetime | zero or one | no | Only after owner acceptance. |
| `backupOwner`, `restoreApprover`, `rpo`, `rto`, `retention`, `encryptionState` | release evidence | typed references/policy | one set per release target | yes before pilot | Provider backup-enabled status alone is not restore proof. |
| `eventName`, `correlationId`, `actorId`, `branchId`, `entityType`, `entityId`, `outcome`, `latencyMs`, `statusCode`, `featureVersion`, `migrationVersion` | observability event | typed fields | many events per release/operation | conditional | Payloads exclude raw evidence and sensitive field values. |

These may be implemented as database records later or retained as release checklist artifacts; this spec does not require code in the planning batch.

## Canonical Entity/Data Model Proposal

| Entity | Purpose | Relationship |
|---|---|---|
| `FeatureRollout` | Global/effective server-side rollout state | one per feature |
| `FeatureRolloutBranch` | Explicit pilot/branch override | feature many-to-many branches |
| Release evidence artifacts | Migration/deployment run ids, checks, owners, and links in approved operations documentation | many per release; do not invent deployed state |

## Manual Entry Flow and Source Precedence

Release evidence is entered manually by the implementer/reviewer after verification. Automated checks can attach results, but owner acceptance is explicit. Current vault truth remains in [[Context]], detailed checklist status remains in [[Planning/Pages/_Overview]], and high-level remaining work remains in [[Planning/PLAN]] section 9.

## Belarc Relationship

Phase 7 enforces the Phase 2 production-disabled Belarc gate. Belarc proposals cannot be enabled in production until licensing, retention, RBAC, redaction, and rollback evidence pass.

## Route/Page Ownership and UX States

| Route/page | Ownership | UX states |
|---|---|---|
| Admin settings or future release page | Operations | disabled, staged, pilot, rollout paused, partial failure, degraded dependency, rollback in progress/completed, restore verified/failed |
| Activity log | Evidence | migration run, flag change, acceptance, denial, rollback; sensitive values redacted |
| Branch detail | Pilot operations | feature unavailable, pilot enabled, accepted, nonpilot denied without dead navigation |

No release UI is required before implementation; if built, it must be accessible, role-scoped, and not expose secrets. Status and progress cannot rely on color, async changes must be announced, polling must preserve focus, and timeout/retry plus task-recovery behavior must be explicit.

## API Contract Direction

| Endpoint | Request direction | Response direction |
|---|---|---|
| `GET /api/operations/feature-flags` | optional authorized branch selector; environment derived from trusted deployment config | effective feature state |
| `PUT /api/operations/feature-flags/:key` | authorized branch scope, enabled, reason; server derives environment | updated flag and activity log |
| `POST /api/operations/release-evidence` | phase, gate, evidence reference, status | evidence record |
| `GET /api/operations/release-evidence` | phase, status | paginated evidence |

These endpoints are optional implementation direction; vault-only release notes remain acceptable until an operations UI is approved. Unknown fields are rejected; flag mutations accept `expectedUpdatedAt`, return `409 STALE_WRITE` on version mismatch, preserve `{ error, code, fieldErrors }`, and write a redacted audit event with correlation id.

## RBAC and Branch/Object Authorization

Only SuperAdmin or explicit release manager permission can change production flags or acceptance records. Branch pilot enablement must be limited to selected branches. All feature endpoints must evaluate environment, role, branch, and object scope.

## Sensitive-Data and Secret-Rejection Rules

Release evidence must never include raw environment variables, database URLs, passwords, JWT secrets, API keys, Belarc raw secrets, product keys, or screenshots exposing credentials. Store references, redacted summaries, and verification timestamps only.

## Additive Migration, Compatibility, Backfill, Rollback

Recommended implementation order:

| Order | Phase | Reason |
|---|---|---|
| 1 | Phase 7 shared release foundation | Needed for flags, evidence, backup/restore, and pilot rules. |
| 2 | Phase 2 Belarc hardening | Can ship disabled; reduces risk before production enablement. |
| 3 | Phase 3 Network infrastructure | Creates interface/port references used by CCTV, server, firewall, ISP. |
| 4 | Phase 4 CCTV/NVR | Depends on branch and optional network references. |
| 5 | Phase 5 Servers/Firewall/ISP | Depends on network references and sensitive-field policy. |
| 6 | Phase 6 Tools/Stock | Can run after shared gates; partially parallel after Phase 3 contracts stabilize. |

Detailed additive order:

1. Preflight target identity, applied migration history, duplicates/orphans, backup status, and isolated restore evidence.
2. Add shared permissions, audit/provenance fields, and rollout tables.
3. Add Phase 2 proposal/artifact metadata and deploy disabled.
4. Add Phase 3 network tables and history indexes.
5. Add reusable `SecretReference`, then Phase 4 CCTV profiles/channels/assignments.
6. Add Phase 5 server/firewall/ISP tables.
7. Add Phase 6 stock ledger/count tables.
8. Run explicit backfills and reconciliation reports.
9. Add validated constraints and partial unique indexes only after clean preflight.
10. Defer contract/removal migrations until legacy code paths are retired in a future approved release.

Compatibility follows expand -> dual-read/backfill -> typed-write -> verify -> later contract. Preserve legacy `Asset.metadata`, `Asset.macAddress`, current Hardware Audit routes, and old API response expectations. Each phase later receives its own focused Prisma and canonical Supabase migration with parity review; neither file proves application, and applied migration history is never edited. First rollback response is feature-off and stop-writes; app rollback is allowed only while schema remains backward-compatible; database repair normally uses a forward-fix migration. Restore is reserved for confirmed corruption/data loss with incident authority. Stock uses compensating entries; topology/channel/circuit history uses end-date plus replacement rows; Belarc uses a corrective official write without deleting decision evidence.

Staging uses a separate database, credentials, object storage, domains, and nonproduction test data. Rollout order is internal SuperAdmin, one owner-approved pilot branch, pilot acceptance window, additional branches, then global. A restore drill must rebuild database and retained evidence artifacts into an isolated target and reconcile migration versions, table counts, orphans, proposal states, network history, camera assignments, circuit relations, stock ledger totals, and artifact hashes. External secrets are not restored into inventory; only reference integrity is checked.

Required metrics include proposal backlog/conflict age, authorization denials, parser rejects, stale-write conflicts, orphan/link errors, low-stock events, count variance, and migration duration/failure. Logs and alerts must omit raw HTML, proposal values, IPs, topology, CCTV locations, domain names, provider account data, stock notes, and secret locators.

## Test and Acceptance Gates

Every phase needs migration dry run/parity review, build/unit/integration/API contracts, direct object/branch authorization tests including guessed IDs/filter substitution, secret rejection/log redaction, keyboard/screen-reader/contrast/reflow checks, query-plan/performance checks, pilot end-to-end and nonpilot denial, isolated backup/restore drill, and feature-off rollback rehearsal. Release evidence must label states separately as specified, coded, statically verified, staged, pilot-verified, deployed, and production-verified. Production rollout requires signed go/no-go acceptance and documented rollback authority.

## Dependencies and Owner Decisions Still Needed

Staging domain/database owner, backup/restore RPO/RTO, pilot branch, release manager, production flag owner, audit evidence location, rollback window, and whether release evidence becomes database-backed UI or remains vault/runbook-based first.

## Estimated Complexity

High.

[[Home]] | [[Context]] | [[Planning/PLAN]] | [[Planning/Pages/_Overview]] | [[Planning/Phase-2-Belarc-Proposal-Hardening-Spec]]
