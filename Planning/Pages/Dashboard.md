---
date: 2026-07-03
tags: [planning, page-spec]
---

# Dashboard — Spec

> Route: `/dashboard`
> Status: ✅ Complete (2026-07-03)
> Task status tracked in: [[Planning/Pages/_Overview#Dashboard]]

---

## What's Built

All planned dashboard widgets are live. Reports page was removed and merged here — see [[Decisions/2026-06-28-reports-merged-into-dashboard]].

| Widget | Data Source |
|--------|------------|
| Summary counters (Total, Assigned, Available, Repair, Disposal) | `/api/reports/summary` → `kpi` |
| Condition donut chart | `/api/reports/summary` → `kpi` |
| Activity bar chart (7-day) | `/api/reports/summary` → `movementsByMonth` |
| Category / brand breakdown (top 5) | `/api/reports/summary` → `topCategories` |
| Utilization metrics panel | Derived client-side from `branchStats` |
| By-branch asset summary | `/api/reports/summary` → `branchStats` |
| By-department asset summary | `/api/reports/summary` → `deptStats` |
| Assignment history (last 8 events) | `/api/reports/summary` → `recentMovements` |
| Condition trend chart | `/api/reports/condition-trend` → `ChartLine.svelte` |
| Movement frequency panel | `/api/reports/movement-frequency` |
| Export CSV | `/api/reports/total-assets` |

---

[[Home]] | [[Planning/Pages/_Overview]]
