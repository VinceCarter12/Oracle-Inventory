---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 4 CCTV/NVR Spec

> Status: Implementation-ready candidate; not implemented.

This phase models CCTV cameras, NVR assets, explicit channel assignments, physical locations, network references, and branch visibility. It stores no raw CCTV credentials.

## Scope and Out of Scope

In scope: camera and NVR asset profiles, explicit channel assignment, physical location labels, network interface references, branch detail visibility, APIs, RBAC, validation, accessibility, and secret-reference-only handling.

Out of scope: video streaming, recordings, screenshots, camera passwords, NVR admin credentials, ONVIF scanning, license plate/face recognition, and automatic discovery.

## Field Dictionary and Cardinality

| Field | Entity | Type | Cardinality | Required | Notes |
|---|---|---|---|---|---|
| `assetId` | `CameraProfile` / `RecorderProfile` | id | one profile per matching asset | yes | Asset owns identity/lifecycle. |
| `branchId` | `Asset` | id | one | yes | Visibility anchor. |
| `physicalLocation`, `coverageArea` | `CameraProfile` | string | one / zero-or-one | yes/no | Controlled location vocabulary is owner-owned; no footage links. |
| `cameraType`, `resolution`, `nightVision`, `motionDetection`, `installationDate`, `notes` | `CameraProfile` | typed fields | one optional set | no | Do not imply live health or monitoring. |
| `recorderType`, `channelCapacity`, `physicalLocation` | `RecorderProfile` | enum/integer/string | one set per recorder | yes | Capacity is policy input; used-channel count is derived from explicit rows. |
| `storageCapacityBytes`, `retentionDaysTarget` | `RecorderProfile` | integer | zero or one each | no | Inventory targets only, never footage. |
| `channelNumber`, `label`, `enabled` | `RecorderChannel` | integer/string/boolean | many channels per recorder | yes/optional | Unique recorder/channel; stable numbering convention is owner-owned. |
| `portId` | `RecorderChannel` | id | zero or one | no | Optional Phase 3 physical port reference. |
| `cameraAssetId`, `channelId` | `CameraChannelAssignment` | ids | one pair per assignment | yes | At most one active channel per camera and one active camera per channel. |
| `validFrom`, `validTo`, `notes` | `CameraChannelAssignment` | datetimes/text | one history envelope | yes/conditional | Reassignment end-dates the old row and creates a replacement. |
| `secretReferenceId` | secret junction | id | zero or many | no | Secret reference metadata only. |

Counts are derived: active cameras per branch, active channels used, unused NVR channels.

## Canonical Entity/Data Model Proposal

| Entity | Purpose | Relationship |
|---|---|---|
| `Asset` | Identity/lifecycle for camera and NVR hardware | parent |
| `CameraProfile` | Camera-specific fields and physical coverage | one to one camera Asset |
| `RecorderProfile` | NVR/DVR-specific capacity and location | one to one recorder Asset |
| `RecorderChannel` | Explicit stable channel inventory | recorder one-to-many |
| `CameraChannelAssignment` | Effective-dated camera/channel mapping | historical many-to-one; one active row per camera and channel |
| `NetworkInterface` | Optional Phase 3 network reference | linked by id, not duplicated |
| `SecretReference` plus `AssetSecretReference` | Metadata-only pointer and explicit Asset junction | reusable catalog; Asset many-to-many refs |

## Manual Entry Flow and Source Precedence

Manual intake creates NVR assets before channel assignment. Camera intake requires branch, physical location, and either unassigned state or explicit NVR/channel assignment. Manual official values always win. Network references are selected from Phase 3 interfaces when available or left as pending manual network details.

## Belarc Relationship

None. Belarc does not supply CCTV/NVR source truth and must not create or update camera, channel, location, NVR, or credential records.

## Route/Page Ownership and UX States

| Route/page | Ownership | UX states |
|---|---|---|
| `/inventory/intake/cctv` | Intake | camera draft, NVR draft, channel conflict, review |
| `/infrastructure/cctv` | Future CCTV page | branch filter, camera list, NVR channel board, unassigned cameras |
| `/assets/[id]` | Asset detail | camera profile, NVR profile, network references, assignment history |
| `/branches/[id]` | Branch detail | camera count, NVR count, uncovered/unassigned summary |

Accessibility: channel board must also render as a table; status cannot rely on color only; all channel assignment controls must be keyboard reachable.

## API Contract Direction

| Endpoint | Request direction | Response direction |
|---|---|---|
| `POST /api/cctv/cameras` | asset identity, branch, location, optional interface; `Idempotency-Key` | camera asset/profile |
| `POST /api/cctv/recorders` | asset identity, branch, capacity, storage; `Idempotency-Key` | recorder asset/profile and explicit channels |
| `GET /api/cctv/cameras` | branch, assigned, q, pagination | camera list plus current NVR/channel |
| `GET /api/cctv/recorders/:assetId/channels` | recorder id | channel table, active/empty/conflict state |
| `POST /api/cctv/channel-assignments` | NVR, channel, camera, effectiveFrom | assignment or conflict response |
| `POST /api/cctv/channel-assignments/:id/end` | effectiveTo, reason, `expectedUpdatedAt` | closed assignment or `409 STALE_WRITE` |
| `/api/secret-references` and Asset junction endpoints | reference metadata only | minimized reference results based on permission |

Unknown request fields are rejected. Mutable resources expose `updatedAt`; mutations accept `expectedUpdatedAt`, creation/assignment operations require `Idempotency-Key`, lists return `{ items, page, pageSize, total }`, and errors preserve `{ error, code, fieldErrors }`.

## RBAC and Branch/Object Authorization

Require `manage_infrastructure_assets` for writes. Require branch match for cameras, NVRs, and selected network interface. Cross-branch NVR/camera channel assignment is blocked unless SuperAdmin explicitly approves a cross-branch exception.

## Sensitive-Data and Secret-Rejection Rules

Reject unknown fields and keys matching password, passwd, pwd, secret, token, credential, username/login, API/private/product/license key, RTSP credentials, recovery codes, embedded-credential URLs, and exported configuration secrets. Do not echo submitted values in errors. Store only approved reference provider, opaque reference id, display label, system, owner team, and rotation metadata; ordinary logs never receive physical-security layouts, channel maps, network values, or secret locators.

## Additive Migration, Compatibility, Backfill, Rollback

Phase 3 networking must land first. Add profiles, channels, assignments, secret catalog/junctions, and indexes; backfill only explicitly recognized camera/recorder Assets while ambiguous metadata remains read-only evidence. Add active-assignment uniqueness only after duplicate preflight. Archive rather than delete assigned cameras, recorders, or channels. Rollback disables writes and uses forward fixes; restore must verify assignment history and reference integrity without copying external secrets.

## Test and Acceptance Gates

Test capacity, one active assignment per camera/channel, historical reassignment, archived recorder behavior, camera/interface/recorder branch match, guessed-ID IDOR, secret rejection across DB/logs/fixtures/errors, optimistic concurrency, and derived counts. Browser-smoke loading, empty, unassigned, no-available-channel, conflict, restricted, stale, retry, recorder/camera creation, reassignment confirmation, branch visibility, and a keyboard-operable semantic channel table.

## Dependencies and Owner Decisions Still Needed

Camera/NVR category names, whether one camera can be assigned to multiple NVRs, channel numbering format, location taxonomy, allowed branch exception policy, and external credential vault naming convention.

## Estimated Complexity

High.

[[Home]] | [[Context]] | [[Planning/Inventory-Field-Dictionary]] | [[Planning/Phase-3-Network-Infrastructure-Spec]] | [[Planning/Pages/Branches]]
