---
date: 2026-06-29
tags: [planning, page-spec]
---

# Activity Log — Spec

> Route: `/activity`
> Status: Backend done — frontend scaffolded, needs full data wiring
> Task status tracked in: [[Planning/Pages/_Overview#Activity-Log]]

---

## Data Source

- Endpoint: `/api/activity`
- Returns: timestamp, user name, action type, entity type, entity ID

## Filter Spec

| Filter | Values |
|--------|--------|
| User | Dropdown — any system user |
| Action type | create, update, delete, assign, return, transfer |
| Entity type | Asset, Employee, Assignment, Branch, User |
| Date range | From / To date pickers |

## Rules

- Activity log is **never deleted** — no delete endpoint exposed in UI
- Archive toggle for logs older than X months (hard — future)
- Per-asset log on `/assets/[id]` — filter by `entityId`
- Per-employee log on `/employees/[id]` — filter by employee involvement

---

[[Home]] | [[Planning/Pages/_Overview]]
