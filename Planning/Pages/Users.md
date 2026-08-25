---
date: 2026-06-29
tags: [planning, page-spec]
---

# Users — Spec

> Routes: `/users`, `/users/[id]`
> Status: Core done — minor enhancements pending
> Task status tracked in: [[Planning/Pages/_Overview#Users]]

---

## Business Rules

- Admin cannot create a second SuperAdmin — enforce via UI (hide option) + API guard
- "Must change password" flag shown on first login — visible on user detail

## User Detail Fields

- Last login time
- Must-change-password indicator
- Role + branch assignment
- Resend onboarding email / reset link action

---

[[Home]] | [[Planning/Pages/_Overview]]
