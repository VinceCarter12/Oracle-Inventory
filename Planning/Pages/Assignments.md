---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Assignments — Changes & Features

> Routes: `/assignments`, `/assignments/assign`, `/assignments/confirm`
> Status: Core done — status bug + UX improvements pending

---

## Bug Fixes / Changes

- [ ] [Easy] Fix: status not auto-changing to "Available" after return is approved
- [ ] [Easy] Fix: assignment date not editable on assign form (default to today, allow override)
- [ ] [Medium] One asset per active assignment enforced — prevent duplicate active assignments to the same person

---

## New Features

- [ ] [Medium] Employee search on assign form: filter by name + branch simultaneously
- [ ] [Medium] Return flow: after approve, auto-set asset status back to Available
- [x] [Hard] Exit check / hardware scan on return — scan assets on employee offboarding ✅ 2026-07-06 (Hardware Audit Phase E, see [[Planning/Pages/HardwareAudit]]): assets with a baseline scan are blocked from return (approve-return, direct return, resignation turnover) until their latest scan is admin-reviewed — enforced server-side, 409 with message if not cleared
- [ ] [Medium] Transfer workflow: direct asset transfer from one employee to another without returning first
- [ ] [Easy] Show assignment history inline on assign form (how many times this asset was assigned)
