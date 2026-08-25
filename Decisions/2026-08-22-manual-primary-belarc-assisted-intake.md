---
date: 2026-08-22
tags: [decision]
---

# ADR: Manual Primary, Belarc-Assisted Inventory Intake

Date: 2026-08-22
Status: Accepted for planning; not implemented

## Decision

Oracle Inventory will use Manual Mode as the primary official intake path for expanded inventory records. Belarc will be used only as a computer-hardware evidence assistant that can verify or propose selected safe fields after review.

## Why

`Inventory Systems.xlsx` covers many fields that Belarc cannot authoritatively provide: employee identity, department, branch, CCTV location, NVR channel, switch port assignment, ISP circuit, tools, BYOD ownership, and operational counts. The workbook also includes sensitive credential fields, typos, duplicate groups, and numbered repeated fields. Those must be normalized before schema or UI implementation.

The existing Hardware Audit flow already supports Belarc HTML upload, baseline, comparison, review, and selected source merge. That should remain a reviewed evidence workflow, not become a broad automatic import source.

## Alternatives Considered

| Alternative | Reason rejected |
|---|---|
| Belarc-first import | Too narrow; does not cover CCTV, ISP, tools, branch relationships, employee truth, or credential safety |
| Restore Excel bulk import | Previously removed by owner decision and the workbook is not row-normalized |
| One large manual form | Too confusing for users and unsafe for sensitive fields |
| Store usernames/passwords in inventory | Not acceptable; only secret references are allowed |

## Consequences

- Expanded inventory needs a data dictionary before schema work.
- Intake UI should be step-based and category-specific.
- Repeated workbook fields become child records, not fixed columns.
- Counts become computed summaries where possible.
- Belarc can verify/propose safe computer fields, but conflicts require admin review.
- New role permissions are needed for intake, Belarc review, infrastructure edit, and secret-reference edit.
- This ADR does not implement schema, routes, import, provider integration, or deployment changes.

[[Home]] | [[Planning/Inventory-Field-Dictionary]] | [[Planning/Pages/Inventory-Intake]]
