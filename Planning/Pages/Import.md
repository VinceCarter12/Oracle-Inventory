---
date: 2026-06-29
tags: [planning, page-spec]
---

# Import — Removed Scope

> Routes: `/assets/import`, `/assets/import/history`, `/assets/import/history/[id]`
> Status: Removed by owner decision on 2026-08-02
> Task status tracked in: [[Planning/Pages/_Overview#Import]]

---

## Decision

Bulk upload/import is no longer part of Oracle Inventory. Remove all connected UI, backend, schema, templates, mapping presets, history/detail views, and API surface. Do not preserve import job tables for future accounts.

## Preserved Data Boundary

- Keep real `Asset` records.
- Keep `ActivityLog` records.
- Do not apply destructive SQL to the current Supabase test database in this cleanup.

## Removal Evidence

- Frontend import routes/navigation/history UI removed.
- Backend import routes/services/templates removed.
- Prisma import models/enums/relations removed from source schema.
- Forward-only Supabase migration created for the next database account.
- API build and 48 tests passed.
- Frontend check reported 0 errors with existing warnings.

---

[[Home]] | [[Planning/Pages/_Overview]]
