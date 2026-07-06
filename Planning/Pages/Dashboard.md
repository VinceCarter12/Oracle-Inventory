---
date: 2026-07-03
tags: [planning, page-tracker]
---

# Dashboard — Changes & Features

> Route: `/dashboard`
> Status: ✅ Complete — all planned widgets built (2026-07-03)

---

## Bug Fixes / Changes

- [x] [Medium] Merge `/reports` analytics into dashboard layout (decision: reports page removed, metrics fold into dashboard)
- [x] [Easy] Remove `/reports` route from sidebar nav and oracle-sv routes
- [x] [Medium] Wire activity bar chart to real backend data (`/api/reports/summary` → `movementsByMonth`)
- [x] [Medium] Wire condition donut chart to live asset condition counts (`/api/reports/summary` → `kpi`)

---

## New Features

- [x] [Easy] Summary counters: Total Assets, Assigned, Available, Under Repair, For Disposal
- [x] [Medium] Category / brand breakdown (top 5 categories via `/api/reports/summary` → `topCategories`)
- [x] [Medium] Utilization metrics panel — derived client-side from `branchStats` (no extra endpoint needed): overall %, avg per branch, top branch, underutilized count
- [x] [Medium] By-branch asset summary (from `/api/reports/summary` → `branchStats`)
- [x] [Medium] By-department asset summary — added `deptStats` to `/api/reports/summary` (departments reached via employee assignments)
- [x] [Hard] Assignment history widget — `recentMovements` added to `/api/reports/summary` (last 8 assign/transfer/return/onboard/offboard events from MovementLog)
- [x] [Hard] Condition trend chart — new endpoint `/api/reports/condition-trend` (monthly repair_send / repair_return / disposal event counts, last 6 months) + new `ChartLine.svelte` component
- [x] [Hard] Movement frequency panel — new endpoint `/api/reports/movement-frequency` (top N assets by MovementLog count, capped at 20) + bar list panel
