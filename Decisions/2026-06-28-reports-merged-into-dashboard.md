---
date: 2026-06-28
tags: [decision]
status: Accepted
---

# ADR: Merge Reports Page into Dashboard

**Date**: 2026-06-28
**Status**: Accepted

## Decision

Remove the standalone `/reports` route and merge its metrics display into the `/dashboard` page.

## Why

The reports page and dashboard serve the same function — displaying asset metrics. Having two separate pages creates redundancy and forces the user to navigate between them for information that belongs together. Consolidating reduces cognitive overhead and keeps the most important data in one place.

## Alternatives Considered

- **Keep them separate** — reports could eventually have export (CSV/PDF) features. Rejected: exports can be added as actions within the dashboard itself.
- **Keep reports as a sub-tab on dashboard** — possible, but a tab adds friction. A single unified view is cleaner.

## Consequences

- `/reports` route is removed (or redirects to `/dashboard`)
- `Planning/REPORTS_FEATURE_PLAN.md` scope changes — report data (metrics, charts) moves to dashboard; only export functionality remains as a separate concern
- Dashboard page becomes more data-rich; layout may need restructuring to accommodate additional metrics
- `oracle-sv/src/routes/reports/` can be deleted or repurposed for export-only

## Follow-up Tasks

- [x] Remove `/reports` route from oracle-sv — deleted 2026-07-03 (`routes/(dashboard)/reports/` incl. `[id]` detail page)
- [x] Merge report metrics/charts into dashboard layout — done 2026-07-03 (utilization, by-dept, condition trend, movement frequency, assignment history)
- [x] Update sidebar nav — Reports link was already removed
- [x] Export moved to dashboard — "Export CSV" button in dashboard header (full asset snapshot via `/api/reports/total-assets`)
- [ ] Update `Planning/REPORTS_FEATURE_PLAN.md` to reflect new scope

## Implementation Notes (2026-07-03)

- Backend report endpoints **kept** — `/api/reports/summary`, `/condition-trend`, `/movement-frequency` feed the dashboard; `/api/reports/total-assets` powers the CSV export. Other `/:reportType` handlers are unused but harmless.
- `DateRangePicker` component no longer has a consumer (was only used by the reports filter bar).

---

[[Decisions/README]] | [[Home]]
