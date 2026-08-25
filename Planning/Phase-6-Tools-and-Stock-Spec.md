---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 6 Tools and Stock Spec

> Status: Implementation-ready candidate; not implemented.

This phase separates individually tagged assets from quantity-managed stock such as tools, cables, adapters, storage devices, docking stations, and presentation equipment.

## Scope and Out of Scope

In scope: decision rule for tagged `Asset` versus quantity stock, stock locations, movement ledger, derived balances, low-stock thresholds, permissions, APIs, UI scope, additive migrations, and tests.

Out of scope: purchasing/procurement, vendor ordering automation, barcode printing for stock bins, accounting valuation, and Excel bulk import.

## Field Dictionary and Cardinality

| Field | Entity | Type | Cardinality | Required | Notes |
|---|---|---|---|---|---|
| `assetId` | `Asset` | id | one per tagged item | conditional | Required for serialized/tagged equipment. |
| `stockItemId` | `StockItem` | id | one per stock catalog item | yes for stock | Used only for quantity-managed items. |
| `sku` | `StockItem` | normalized string | one | yes | Globally unique by default; a branch-specific catalog would require a new owner decision. |
| `name`, `category`, `unitOfMeasure`, `description` | `StockItem` | typed fields | one set per item | yes/yes/yes/no | Categories and units use owner-approved vocabularies. |
| `active`, `archivedAt` | `StockItem` | boolean/datetime | one lifecycle state | yes/no | Archived items remain in historical movements and cannot receive new ordinary movements. |
| `isSerialized` | intake decision | boolean | one | yes | If true, create Asset instead of stock movement. |
| `locationId` | `StockLocation` | id | one per ledger entry/count | yes | Branch-scoped balance bucket. |
| `branchId`, `name`, `locationType`, `description`, `archivedAt` | `StockLocation` | typed fields | one set per location | yes/yes/yes/no/no | Types: `room`, `cabinet`, `vehicle`, `employee_custody`, `other`; branch is the authorization anchor. |
| `quantity` | `StockMovement` | decimal(18,3) | one positive value per movement | yes | Direction lives in signed ledger entries; unit must match the item. |
| `movementType` | `StockMovement` | enum | one | yes | `receive`, `issue`, `transfer`, `adjustment`, `count_correction`, `consume`, `return`, `opening`. |
| `reason`, `referenceType`, `referenceId`, `idempotencyKey` | `StockMovement` | text/ids | one set per event | conditional | Reason required for adjustment/count correction; idempotency key required and unique for writes. |
| `performedById`, `approvedById`, `createdAt`, `approvedAt` | `StockMovement` | ids/datetimes | one audit envelope per event | yes/conditional | Approver/time required where policy requires approval; actor comes from authenticated context. |
| `relatedEmployeeId` | movement | id | zero or one | no | For issued tools/stock. |
| `relatedAssetId` | movement | id | zero or one | no | For stock used on an asset. |
| `locationId`, `quantityDelta` | `StockLedgerEntry` | id/signed decimal | one or two entries per movement | yes | Receive/issue have one entry; transfer has equal negative/positive entries atomically. |
| `status`, `startedById`, `submittedAt`, `approvedById`, `approvedAt` | `StockCountSession` | typed fields | many sessions per location | yes/conditional | Draft, submitted, approved, rejected/cancelled states; segregation rules apply. |
| `expectedQuantitySnapshot`, `countedQuantity`, `variance` | `StockCountLine` | decimals | one line per item/session | yes | Approval creates adjustment movements; never updates a balance column. |
| `minimumQuantity`, `reorderQuantity` | `StockLevelPolicy` | decimals | zero or one per item/location | no | Low-stock policy; current status is derived. |
| `balance` | derived query | computed | one per item/location | no manual edit | Sum of ledger deltas only. |

## Canonical Entity/Data Model Proposal

| Entity | Purpose | Relationship |
|---|---|---|
| `Asset` | Individually tagged, serialized, assigned, or lifecycle-managed equipment | existing parent path |
| `StockItem` | Quantity-managed item definition | many locations/movements |
| `StockLocation` | Branch-scoped storage/custody location | many balances |
| `StockMovement` | Immutable business event with actor, approval, reason, and idempotency | item one-to-many |
| `StockLedgerEntry` | Signed per-location effect; source of balance truth | movement one-to-two entries |
| `StockCountSession` / `StockCountLine` | Draft-submit-approve physical reconciliation with snapshots and variance | location one-to-many sessions; session one-to-many lines |
| `StockLevelPolicy` | Minimum/reorder policy per item/location | optional one per pair |

Decision rule: if the item has a serial number, asset tag, warranty, individual assignment, or lifecycle state, use `Asset`. If it is interchangeable and tracked by quantity, use `StockItem` plus movements.

## Manual Entry Flow and Source Precedence

Manual entry starts with an Asset vs Stock decision screen. Asset path sends the user to normal Asset intake. Stock path creates/selects an item and location, then records an immutable movement and shows the derived balance. A receive creates one positive destination entry; issue creates one negative source entry; transfer creates equal source/destination entries in one transaction; an approved count variance creates adjustment movements. Converting stock into a tracked Asset is one approved issue-plus-Asset-creation transaction with provenance, never a silent mode flip.

## Belarc Relationship

None. Belarc does not create tools/stock. Belarc-observed peripherals may suggest that a tagged peripheral asset exists, but stock quantities are manual only.

## Route/Page Ownership and UX States

| Route/page | Ownership | UX states |
|---|---|---|
| `/inventory/intake/tools-stock` | Intake | asset-vs-stock decision, stock movement draft, review |
| `/stock` | Future stock page | list, low-stock, branch/location filters, empty state |
| `/stock/items/:id` | Future stock detail | balances, movements, thresholds |
| `/stock/movements` | Movement workspace | pending/complete/failed transfer, filters, immutable audit history |
| `/stock/counts/[id]` | Count workflow | draft, submitted, variance, approval, reconciliation |
| `/branches/[id]` | Branch detail | stock count summary and low-stock indicators |
| `/assets` | Asset list | tagged tools/presentation equipment remain visible as assets |

Accessibility: quantity steppers must allow keyboard numeric entry, tables must expose movement history, and low-stock cannot rely on color only.

## API Contract Direction

| Endpoint | Request direction | Response direction |
|---|---|---|
| `POST /api/stock/items` | globally unique SKU, name, category, unit, description; `Idempotency-Key` | global catalog item; branch access is through authorized locations, not caller-defined visibility text |
| `GET /api/stock/items` | branch, location, category, lowStock, q | paginated items with derived balances |
| `POST /api/stock/movements` | item, type, positive quantity, source/destination, reason, `Idempotency-Key` | movement, ledger entries, and derived balances |
| `GET /api/stock/items/:id/movements` | filters, pagination | immutable ledger |
| `PUT /api/stock/policies/:id` | minimum/reorder quantity, `expectedUpdatedAt` | policy or `409 STALE_WRITE` |
| `POST /api/stock/count-sessions` | location and item scope; `Idempotency-Key` | draft count with expected snapshots |
| `POST /api/stock/count-sessions/:id/submit` | expected version | submitted count |
| `POST /api/stock/count-sessions/:id/approve` | reason and expected version | compensating adjustments and reconciled balances |
| `GET /api/branches/:id/stock-summary` | branch id | derived counts and low-stock list |

Unknown request fields are rejected. Lists return `{ items, page, pageSize, total }`; mutable policy/session resources expose `updatedAt`; errors preserve `{ error, code, fieldErrors }`; balance-changing commands are idempotent and transactionally locked.

## RBAC and Branch/Object Authorization

Require separate `view_stock`, `manage_stock`, and `approve_stock_adjustments`. Branch/location object scope is authoritative. Cross-branch transfer requires both source and destination scope and, if approved, destination acceptance. A count submitter cannot approve their own variance above the owner threshold. Negative stock is blocked by default under a row lock/serializable transaction; only a separately approved exceptional adjustment policy may override it.

## Sensitive-Data and Secret-Rejection Rules

Stock should not accept secrets, product keys, software license keys, device passwords, or vendor portal credentials. Storage location notes must not contain keys or passwords.

## Additive Migration, Compatibility, Backfill, Rollback

Add catalog, location, movement, ledger, count, policy, permission, and invariant indexes without moving existing Assets. Workbook counts are never backfilled as balances. Opening balances require an approved opening count/session and generated opening movements. Normal APIs cannot update/delete ledger entries; corrections use compensating movements. Rollback disables writes and uses compensating entries/forward fixes. Restore validation recomputes every balance from ledger entries.

## Test and Acceptance Gates

Test Asset-vs-stock classification, double-entry invariants, idempotency, concurrent issue, negative-stock prevention, unit precision, cross-branch authorization, transfer acceptance, count segregation, variance approval, archive dependencies, low-stock derivation, compensating corrections, and restore recomputation. Browser smoke empty/zero/low/insufficient/concurrent/pending/error states plus item, receive, issue, transfer, count, policy, and branch summary with explicit units, semantic ledger tables, non-color status, and announced updates.

## Dependencies and Owner Decisions Still Needed

Final stock categories, allowed units, location taxonomy, negative-balance policy, who can adjust counts, whether employees can hold stock, and whether any existing assets should be reclassified through a reviewed migration.

## Estimated Complexity

High.

[[Home]] | [[Context]] | [[Planning/Inventory-Field-Dictionary]] | [[Planning/Pages/Assets]] | [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]]
