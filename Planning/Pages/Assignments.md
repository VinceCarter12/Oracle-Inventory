---
date: 2026-06-29
tags: [planning, page-spec]
---

# Assignments — Spec

> Routes: `/assignments`, `/assignments/assign`, `/assignments/confirm`
> Status: Core done — status bug + UX improvements pending
> Task status tracked in: [[Planning/Pages/_Overview#Assignments]]

---

## Business Rules

- **One asset per active assignment** — prevent duplicate active assignments to same person
- **Return flow** — after approve, auto-set asset status back to Available
- **Exit check on return** — assets with a baseline hardware scan are blocked from return until latest scan is admin-reviewed. Enforced server-side (409 with message). All three return paths covered: `approve-return`, `direct return`, `resignation/turnover`. See [[Planning/Pages/HardwareAudit]].
- **Direct transfer** — asset can transfer from one employee to another without returning first

## Known Fixes Pending

- Status not auto-changing to "Available" after return approved
- Assignment date not editable on assign form (should default to today, allow override)

---

[[Home]] | [[Planning/Pages/_Overview]]
