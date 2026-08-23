---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 2 Belarc Proposal Hardening Spec

> Status: Implementation-ready candidate; not implemented.
> Production rule: keep disabled until commercial Belarc licensing and raw evidence retention decisions are approved.

This phase hardens the existing Belarc-assisted computer workflow after [[Planning/Phase-1-Computer-Intake-Spec]]. Manual entry remains the official source of truth. Belarc is computer-only evidence/proposal support and never an automatic overwrite path.

## Scope and Out of Scope

In scope: licensing feature gate, safe field allowlist, raw evidence policy, proposal review queue, conflict handling, provenance, RBAC, redacted logs, additive migration plan, and rollback behavior.

Out of scope: restoring Excel bulk import, Belarc-first inventory creation, automatic baseline acceptance, non-computer inventory discovery, software license inventory, password/product-key storage, and production enablement before owner approval.

## Field Dictionary and Cardinality

| Field | Entity | Type | Cardinality | Required | Notes |
|---|---|---|---|---|---|
| `belarcFeatureEnabled` | Phase 7 rollout control plus environment kill switch | boolean | one effective value per environment/branch | yes | Must default false in production until licensing and retention are approved. |
| `scanId` | `HardwareScan` | id | one per uploaded file | yes | Existing scan identity remains source evidence. |
| `assetId` | `HardwareScan` / proposal | id | many scans per asset | yes | Must pass branch/object authorization. |
| `rawEvidenceRetention` | policy concept | enum | one active policy | yes before production | `none`, `encrypted_limited`, or `redacted_only`; owner decision required. |
| `artifactId` | `HardwareScan` | id | zero or one per scan | no | Points to encrypted evidence metadata; no new production artifact writes until policy approval. |
| `rawHtml` | existing `HardwareScan` compatibility field | text | zero or one per legacy scan | conditional | Remains readable during transition; never proves an approved future retention policy. |
| `parserVersion`, `sourceProduct`, `sourceLicenseBasis`, `contentSha256` | `HardwareScan` | strings | one set per scan | yes for new writes | Makes parser and licensing provenance auditable without logging report content. |
| `retentionUntil`, `purgedAt` | `HardwareScan` / artifact | datetime | zero or one each | conditional | Required when evidence is retained or purged. |
| `parsedSpecs` | `HardwareScan` | JSON | one per scan | yes | Minimized parser output; unsafe sections never become proposals. |
| `fieldKey` | `InventoryFieldProposal` | string | many per observation | yes | Must be in the approved safe allowlist. |
| `targetType`, `targetRecordId` | `InventoryFieldProposal` | string/id | one target per proposal | yes/conditional | Identifies a typed official record and field, never an arbitrary metadata path. |
| `proposedValueJson` | `InventoryFieldProposal` | JSON | one per proposal | yes | Reject secrets and unsafe sections before persistence. |
| `officialValueSnapshotJson` | `InventoryFieldProposal` | JSON | zero or one | yes | Re-read at resolution; mismatch returns `409 STALE_WRITE`. |
| `state`, `resolution` | `InventoryFieldProposal` | enum | one per proposal | yes | States: `proposed`, `verified`, `conflict`, `accepted`, `rejected`, `superseded`, `unavailable`; a corrective write never deletes the decision row. |
| `sourceConfidence` | proposal/observation | enum | one per value | yes | `observed`, `matched`, `reviewed_accepted`, `conflicted`. |
| `resolvedById`, `resolvedAt`, `reason` | `InventoryFieldProposal` | id/datetime/text | zero or one each | conditional | Resolver, time, and reason are required for terminal decisions. |
| `storageProvider`, `storageKey`, `sha256`, `byteSize`, `mimeType`, `encrypted` | `HardwareEvidenceArtifact` | typed metadata | one set per retained artifact | conditional | `storageKey` is restricted; content is outside ordinary list/detail payloads. |

## Canonical Entity/Data Model Proposal

Keep `Asset` as identity/lifecycle. Keep `HardwareScan` as scan evidence/baseline. Add proposal records rather than expanding `Asset.metadata`.

| Entity | Purpose | Relationship |
|---|---|---|
| `InventoryObservation` | Evidence/provenance envelope with asset, scan, branch snapshot, observer, source label, parser version, and observation time | asset one-to-many; scan zero-or-one observation |
| `InventoryFieldProposal` | One proposed or verified allowlisted field targeting a typed official record | observation one-to-many; one active row per observation/target/field |
| `HardwareEvidenceArtifact` | Encrypted raw-report storage metadata and retention lifecycle | scan zero-or-one artifact |
| `HardwareScan.isBaseline` | Explicit comparison baseline, separate from proposal decisions | asset zero-or-one current baseline, enforced by a partial unique index after preflight |

Safe target paths are limited to computer fields: `Asset.computerName`, `Asset.serialNumber`, `Asset.assetTag` only when genuinely present, `DeviceProfile.brand`, `DeviceProfile.model`, `DeviceProfile.processor`, `DeviceProfile.motherboard`, `DeviceProfile.operatingSystem`, `DeviceProfile.osVersion`, and reviewed `AssetComponent` RAM/storage rows. `Asset.name` remains the human operational label: Belarc system model must never update it. `DeviceProfile.deviceSerial`, if introduced by Phase 1, is a compatibility alias to backfill only when nonconflicting; `Asset.serialNumber` remains canonical. `Asset.macAddress` and `Asset.metadata` remain legacy read-only compatibility fields, not Phase 2 official-write targets.

## Manual Entry Flow and Source Precedence

Manual official values win. Belarc can verify matching values, propose blank values, or create conflicts for differing nonblank values. Accepting proposals updates official fields only after explicit review. Accepting a Belarc proposal does not accept or replace the baseline scan.

## Belarc Relationship

Belarc is the core subject of this phase, but it remains evidence-only. It must be disabled in production until commercial BelManage/export/API rights, allowed storage, parser retention, and customer CMDB usage are confirmed.

## Route/Page Ownership and UX States

| Route/page | Ownership | UX states |
|---|---|---|
| `/hardware-audit/upload` | Hardware Audit | disabled gate, dry-run parsed, unsafe fields omitted, proposals generated, conflict summary |
| `/hardware-audit` | Review queue | pending proposal, verified, conflict, accepted, rejected, rollback available |
| `/hardware-audit/[scanId]` | Review detail | side-by-side official/proposed values, allowlist marker, provenance, redaction notice |
| `/assets/[id]` Hardware tab | Asset detail | latest verified scan, open conflicts, accepted source badges |

## API Contract Direction

| Endpoint | Request direction | Response direction |
|---|---|---|
| `POST /api/hardware-audit/scan?dryRun=true` | asset id plus file; no official writes | parsed safe fields, omitted unsafe count, license gate state |
| `POST /api/hardware-audit/scan` | asset id plus file | scan id, proposal summary, conflicts, no auto-overwrite |
| `GET /api/hardware-audit/capabilities` | authenticated request | effective licensing/retention/feature state without secret configuration |
| `GET /api/hardware-audit/proposals` | filters: branch, asset, state, field; server derives allowed branches | `{ items, page, pageSize, total }` with minimized safe values |
| `POST /api/hardware-audit/proposals/:id/resolve` | `decision`, `reason`, `expectedUpdatedAt`; `Idempotency-Key` | atomic typed-field write or verification plus terminal decision and audit id |
| Corrective official update | expected current value and reason | reasoned replacement write; proposal and decision evidence remain immutable |

Unknown request fields are rejected. Mutations preserve `{ error, code, fieldErrors }` error compatibility and return `409 STALE_WRITE` when the official snapshot or proposal version changed. Creation and resolution operations require an `Idempotency-Key`.

## RBAC and Branch/Object Authorization

Require authenticated user, permission, branch scope, and target asset visibility on every endpoint. SuperAdmin can review globally. Branch Admin can view own-branch scan summaries only if granted; conflict acceptance and raw evidence remain SuperAdmin-only until an owner decision expands authority. List, badge, detail, raw, baseline, review, proposal, and resolution routes must load the scan's Asset and derive scope from that object. Caller-supplied `branchId` is a filter only, never authorization. The current global badge and incompletely scoped detail/raw/baseline/review behavior are release blockers for Phase 2 enablement.

## Sensitive-Data and Secret-Rejection Rules

Reject or redact passwords, product keys, API keys, usernames used as credentials, license keys, cookies, tokens, and unsupported Belarc sections before logs or persistence. Logs store field keys, counts, ids, and redaction reason, not raw values.

## Additive Migration, Compatibility, Backfill, Rollback

Add observation, proposal, and artifact-metadata tables plus nullable scan links first. Backfill existing scans with hashes and compatibility observation envelopes only; never infer accepted proposals. Preflight duplicate baselines before adding the partial unique baseline index. Leave `rawHtml` readable for compatibility until an approved artifact policy changes new writes. Rollback is feature-off plus a forward-fix migration and, for accepted values, a reasoned corrective official write only when the expected current value matches. Evidence purge is irreversible and requires retention/backup authority.

## Test and Acceptance Gates

Unit-test parser allowlist/redaction, bounded parser work, proposal state transitions, snapshot conflicts, corrective writes, and branch authorization. API-test every Hardware Audit route for guessed-ID and filter-substitution IDOR, dry-run, production-disabled `503 BELARC_PROPOSALS_DISABLED`, idempotent resolution, baseline separation, and raw-evidence denial. Browser-smoke disabled, upload, processing, empty/filtered-empty, conflict, stale, purged-evidence, unauthorized, retry, and success states with keyboard-operable semantic comparison tables and non-color labels. Acceptance requires commercial license and retention approval before production enablement, plus isolated purge/restore proof.

## Dependencies and Owner Decisions Still Needed

Commercial Belarc product/contract, raw evidence retention mode, who can view raw evidence, conflict authority beyond SuperAdmin, production feature flag owner, and retention deletion schedule.

## Estimated Complexity

High.

[[Home]] | [[Context]] | [[Planning/Phase-1-Computer-Intake-Spec]] | [[Planning/Pages/HardwareAudit]] | [[Decisions/2026-08-22-manual-primary-belarc-assisted-intake]]
