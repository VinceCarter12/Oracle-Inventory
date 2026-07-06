---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Activity Log — Changes & Features

> Route: `/activity`
> Status: Backend done — frontend scaffolded, needs full data wiring

---

## Bug Fixes / Changes

- [ ] [Medium] Wire activity log list to `/api/activity` en dpoint (currently scaffolded/static)
- [ ] [Medium] Show real timestamps, user names, action types from backend response

---

## New Features

- [ ] [Medium] Filter by user — dropdown to select a specific user's actions
- [ ] [Medium] Filter by action type — e.g. "create", "update", "delete", "assign", "return"
- [ ] [Medium] Filter by entity type — e.g. Asset, Employee, Assignment
- [ ] [Easy] Date range filter (from / to)
- [ ] [Easy] Activity log never deleted — confirm API has no delete endpoint exposed to UI
- [ ] [Hard] Archive old logs — flag logs older than X months as archived, show archive toggle
- [ ] [Medium] Per-asset activity log on `/assets/[id]` — filter by entityId
- [ ] [Medium] Per-employee activity log on `/employees/[id]` — show actions involving that employee
