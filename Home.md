---
date: 2026-06-28
tags: [dashboard]
---

# Oracle Inventory — Vault Home

> Central hub for all project notes. Start here.

---

## Project

| Item | Value |
|------|-------|
| **Product** | Oracle Inventory — asset tracking system |
| **Stack** | SvelteKit 5 + Express + Prisma + PostgreSQL |
| **Live URL** | `oracleinventory.lubesmastery.com` |
| **Repo** | github.com/VinceCarter12/Oracle-Inventory |
| **Client** | Sir Jay (IT admin, Manila / Cebu / Davao) |

---

## Quick Status

| Area | Status |
|------|--------|
| SvelteKit frontend (oracle-sv) | In progress — dashboard + reports fully wired |
| Express API (oracle-api) | In progress — most routes built |
| V2 features (RBAC, OTP, Branches) | Complete — OTP login page deferred |
| Import system | Complete — Excel/CSV importer |
| Deployment | Pending — Hostinger FTP (legacy), SvelteKit adapter TBD |

---

## Vault Index

> This is the single source of truth for what exists in the vault.
> Claude must check here before creating or editing any note.
> When a new note is created, add it here immediately.

### Planning

| File | Description |
|------|-------------|
| [[Planning/PLAN]] | Master roadmap and build phases |
| [[Planning/REPORTS_FEATURE_PLAN]] | Reports feature spec and data requirements |

### Page Trackers (`Planning/Pages/`)

| File | Description |
|------|-------------|
| [[Planning/Pages/_Overview]] | Master checklist — all pages and features in one view |
| [[Planning/Pages/Dashboard]] | Dashboard changes and new features |
| [[Planning/Pages/Assets]] | Assets list, detail, add — fields, tagging, maintenance |
| [[Planning/Pages/Assignments]] | Assignment flows, return, transfer |
| [[Planning/Pages/Employees]] | Employee list, profile, offboarding |
| [[Planning/Pages/Branches]] | Branch management, map visualization |
| [[Planning/Pages/Roles]] | Role types, permission matrix |
| [[Planning/Pages/Users]] | User management |
| [[Planning/Pages/ActivityLog]] | Activity log UI wiring and filters |
| [[Planning/Pages/ScanSystem]] | Mobile scan + admin review queue |
| [[Planning/Pages/Auth]] | Login, OTP login flow |
| [[Planning/Pages/Import]] | Bulk import UX and bug fixes |
| [[Planning/Pages/Deployment]] | Deployment checklist |
| [[Planning/Pages/HardwareAudit]] | Belarc hardware audit — upload, compare, review queue — wireframes |

### Design

| File | Description |
|------|-------------|
| [[Design/DESIGN]] | Full design system — tokens, typography, spacing, color |

### Journal

| File | Description |
|------|-------------|
| [[Journal/2026-07-06]] | Hardware Audit Phase A — Belarc parser built + tested |
| [[Journal/2026-07-03]] | Dashboard WIP + Reports wired |
| [[Journal/2026-06-28]] | Catch-up entry — full history reconstructed from git log |

### Decisions

| File | Description |
|------|-------------|
| [[Decisions/README]] | ADR index + key decisions already made |
| [[Decisions/2026-06-28-reports-merged-into-dashboard]] | Merge Reports Page into Dashboard |

### Notes

| File | Description |
|------|-------------|
| [[Notes/README]] | Notes folder guide and suggested topics |
| [[Notes/Meeting_2026-06-28_Inventory System Review]] | Meeting notes — inventory system feature review, asset categories, bulk import, roles |
| [[Notes/Meeting_2026-06-28_Transcribe_Tagalog]] | Cleaned Tagalog transcript — meeting dialogue only |
| [[Notes/Meeting_2026-06-28_Transcribe_Full]] | Full raw transcript — Part 1 (New Recording 33) + Part 2 (Video Project 2), combined |
| [[Notes/Meeting_2026-06-28_Feature_Requests]] | Extracted feature requests from demo review — grouped by area, with bug table |

### Other

| File | Description |
|------|-------------|
| [[INBOX]] | Raw ideas and tasks dumped between sessions |
| [[QUICK]] | General quick capture — anything goes, run `/sort` to file |
| [[CLAUDE]] | Claude instructions for this vault |

---

## Recent Sessions

- [[Journal/2026-07-06]] — Hardware Audit Phase A: Belarc parser (`oracle-api/src/lib/belarc/`), 21 sections + volatility tiers, 20 tests against real export
- [[Journal/2026-07-03]] — Dashboard complete · `/reports` deleted per ADR · Export CSV + DateRangePicker added to dashboard header
- [[Journal/2026-06-28]] — Catch-up: full history reconstructed from git log
