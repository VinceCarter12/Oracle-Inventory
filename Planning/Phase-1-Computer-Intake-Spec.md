---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 1 Computer Intake Spec

> Status: Implementation-ready candidate; not implemented.
> Scope: Manual Mode for company computers first, with Belarc-assisted proposals kept behind a disabled production flag until licensing is resolved.

This spec narrows the approved [[Planning/Pages/Inventory-Intake]] plan into the first buildable phase. It keeps the initial release focused on computers and laptops because those records create the core pattern for assets, components, assignments, source confidence, and Belarc evidence.

## Recommended Defaults

| Decision | Default |
|---|---|
| Primary source | Manual Mode is official. Belarc is evidence/proposal only. |
| First record type | Company desktop/laptop only. Other asset families stay planned. |
| Required branch | Company computers require an active Branch before save. |
| Asset tag | `assetTag` is canonical and unique when nonblank. Historical duplicates or blanks go to review instead of blocking migration. |
| Computer name | Warning-only duplicate signal. It is useful for matching but not a stable identity. |
| Initial assignment | Optional at creation. The asset can be saved as available/unassigned. |
| Branch Admin approval | Branch Admin may approve manual intake for assets in their own branch. |
| Belarc conflict authority | Super Admin only for initial Belarc conflicts and raw evidence visibility. |
| Baseline rule | Accepting Belarc proposals does not automatically create or replace the baseline scan. Baseline remains explicit. |
| Production Belarc flag | `BELARC_PROPOSALS_ENABLED=false` for production until commercial licensing and retention rules are approved. |
| Legacy metadata | Existing `Asset.metadata` stays read-only evidence during Phase 1. Do not make it the new data model. |
| Raw Belarc retention | No new production raw Belarc retention decision until Belarc commercial rights are confirmed. |

## Data Contract

Phase 1 should add typed records for computer details rather than expanding `Asset` into a large mixed table.

| Concept | Required behavior |
|---|---|
| `Asset` | Keeps canonical identity, tag, branch, status, condition, ownership, and category. |
| `DeviceProfile` | Stores computer/laptop specs such as brand, model, serial, processor, motherboard, OS, OS version, install date, and source metadata. |
| `AssetComponent` | Stores repeatable RAM and storage rows with type, slot/bay, brand/model, serial, capacity, and source metadata. |
| `InventoryObservation` | Stores reviewed manual/Belarc evidence before or beside official fields. |
| Activity log | Records create/update/approve/conflict decisions with actor, previous value, new value, source, and reason. |

## Manual Wizard

The first implementation should use the same proposed route family from [[Planning/Pages/Inventory-Intake]]:

| Step | Fields |
|---|---|
| Identity | Asset tag, computer name, category, branch, ownership, serial number, brand, model. |
| Lifecycle | Status, condition, purchase date, warranty expiry, notes. |
| Specifications | Processor, RAM rows, storage rows, OS, motherboard. |
| Assignment | Optional employee assignment, custodian, department display, effective date. |
| Review | Missing required fields, duplicate warnings, source labels, confirmation summary. |

Draft save is required because real site walkthrough data will be incomplete. Drafts are not official inventory until approved or submitted by an authorized user.

## Belarc-Assisted Rules

Belarc-assisted flow is scoped to safe computer fields only.

| Case | Behavior |
|---|---|
| Official field is blank | Create a proposal; admin must accept. |
| Official field matches Belarc | Mark as verified evidence. |
| Official field differs | Create a conflict; do not overwrite. |
| Unsafe, volatile, or licensing-unclear data | Ignore for official fields; retain only if an approved retention policy exists. |

Accepted Belarc proposals should write normal official fields plus source metadata. They must not silently alter assignment, branch, employee identity, credentials, or network authority.

## UX Contract

- Use compact operations UI, not a giant spreadsheet-like form.
- Show only computer fields in Phase 1.
- Put `Manual`, `Belarc`, `Proposed`, `Verified`, and `Conflict` labels near the affected fields.
- Treat duplicate asset tags as blocking except documented historical exceptions.
- Treat duplicate computer names as warning-only.
- Keep the final review screen short: identity, branch, assignment, specs summary, warnings, and source changes.
- Do not display raw secrets or unsupported Belarc sections.

## Permission Contract

| Action | Recommended role |
|---|---|
| Create manual computer draft | Admin or Super Admin |
| Submit official computer record | Admin for own branch; Super Admin globally |
| Edit official computer identity | Admin for own branch; Super Admin globally |
| Approve Belarc proposed field | Super Admin in Phase 1 |
| Resolve Belarc conflict | Super Admin in Phase 1 |
| View raw Belarc evidence | Super Admin only |

## Phase 1 Exit Criteria

Phase 1 is ready for a focused implementation PR only when these are true:

- Schema migration is additive and has rollback/restore notes.
- Manual computer wizard can create an official asset without Belarc.
- Branch requirement, asset-tag uniqueness, and computer-name warning are verified.
- Device profile and repeatable RAM/storage rows are visible on asset detail.
- Activity log records all official changes.
- Belarc proposal code is disabled in production unless licensing is approved.
- Browser smoke covers create draft, submit official record, optional assignment, and asset detail display.

## Not In Phase 1

- Network switches, APs, VLANs, port maps, CCTV/NVR, ISP circuits, and tool stock.
- Raw credential storage.
- New bulk Excel import.
- Automatic Belarc overwrite.
- Commercial Belarc integration or raw production retention.

[[Home]] | [[Context]] | [[Planning/Inventory-Field-Dictionary]] | [[Planning/Pages/Inventory-Intake]] | [[Decisions/2026-08-22-manual-primary-belarc-assisted-intake]]
