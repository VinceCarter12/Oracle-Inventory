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
| SvelteKit frontend (oracle-sv) | In progress — dashboard done; hardware audit upload + asset Hardware section live |
| Express API (oracle-api) | In progress — 17 route modules; hardware-audit (Belarc parse + compare) added 2026-07-06 |
| Hardware Audit feature | ✅ COMPLETE (A–E) — parser, baseline flow, comparison, review queue, exit-check block on returns |
| V2 features (RBAC, OTP, Branches) | Complete — OTP login page deferred |
| Inventory expansion (Phases 1–7) | Phase 7 rollout foundation (`fcb49a9`) and Phase 1 computer intake (`1f6b6a6`) are isolated local commits; Phases 2–6 remain local candidates. Migrations, browser/staging verification, and production release remain pending |
| Import system | Removed — bulk upload UI/API/schema cleanup prepared; forward-only Supabase removal migration exists but was not applied to the test DB |
| Deployment | Partial — Render API is live; Vercel Preview is ready, but Vercel Production has no successful deployment yet |

---

## Vault Index

> This is the single source of truth for what exists in the vault.
> Claude must check here before creating or editing any note.
> When a new note is created, add it here immediately.

### Planning

| File | Description |
|------|-------------|
| [[Context]] | Current project truth, focus, conflicts, and task-specific read-next routing |
| [[Planning/PLAN]] | Master roadmap and build phases |
| [[Planning/Inventory-System-Blueprint]] | Device, network, CCTV, security, data, and phased expansion direction |
| [[Planning/Inventory-Field-Dictionary]] | Canonical field dictionary for the workbook-driven manual and Belarc-assisted expansion |
| [[Planning/Phase-1-Computer-Intake-Spec]] | Implementation-ready candidate spec for computer/laptop Manual Mode and gated Belarc proposals |
| [[Planning/Phase-2-Belarc-Proposal-Hardening-Spec]] | Implementation-ready candidate spec for gated Belarc proposal review, provenance, redaction, and rollback |
| [[Planning/Phase-3-Network-Infrastructure-Spec]] | Implementation-ready candidate spec for interfaces, IP history, VLANs, switches, ports, topology, and branch connectivity |
| [[Planning/Phase-4-CCTV-NVR-Spec]] | Implementation-ready candidate spec for cameras, NVRs, channel assignments, locations, and secret-reference-only handling |
| [[Planning/Phase-5-Servers-Firewall-ISP-Spec]] | Implementation-ready candidate spec for servers, firewalls, ISP circuits, addressing, and sensitive infrastructure controls |
| [[Planning/Phase-5-Handoff-and-Release-Plan]] | Claude handoff contract and Codex release sequence for the remaining Phase 5–6 work |
| [[Planning/Phase-6-Tools-and-Stock-Spec]] | Implementation-ready candidate spec for tagged assets versus quantity-managed stock and immutable stock movements |
| [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]] | Implementation-ready candidate spec for cross-phase release gates, flags, staging, pilot rollout, backup, rollback, and acceptance |
| [[Planning/Release-Phase-1-7-Isolation-Manifest]] | File-ownership map and focused-commit sequence for the locally implemented Phase 1–7 expansion |
| [[Planning/REPORTS_FEATURE_PLAN]] | Reports feature spec and data requirements |

### Page Trackers (`Planning/Pages/`)

| File | Description |
|------|-------------|
| [[Planning/Pages/_Overview]] | Master checklist — all pages and features in one view |
| [[Planning/Pages/Dashboard]] | Dashboard changes and new features |
| [[Planning/Pages/Assets]] | Assets list, detail, add — fields, tagging, maintenance |
| [[Planning/Pages/Assignments]] | Assignment flows, return, transfer |
| [[Planning/Pages/Employees]] | Employee list, profile, offboarding |
| [[Planning/Pages/Departments]] | Department management, employee resolution, and release blockers |
| [[Planning/Pages/Branches]] | Branch management, map visualization |
| [[Planning/Pages/Roles]] | Role types, permission matrix |
| [[Planning/Pages/Users]] | User management |
| [[Planning/Pages/ActivityLog]] | Activity log UI wiring and filters |
| [[Planning/Pages/ScanSystem]] | Mobile scan + admin review queue |
| [[Planning/Pages/Auth]] | Login, OTP login flow |
| [[Planning/Pages/Import]] | Removed bulk import scope and removal evidence |
| [[Planning/Pages/Deployment]] | Deployment checklist |
| [[Planning/Pages/HardwareAudit]] | Belarc hardware audit — upload, compare, review queue — wireframes |
| [[Planning/Pages/Inventory-Intake]] | Manual Mode and Belarc-assisted inventory intake flow, page rules, and implementation phases |

### Design

| File | Description |
|------|-------------|
| [[Design/DESIGN]] | Full design system — tokens, typography, spacing, color |

### Journal

| File | Description |
|------|-------------|
| [[Journal/2026-08-25]] | Phase 5 migration blocked (Codex-owned); PR #22 (Branches modal) + PR #23 (Departments) merged; PR #24 folds Computer/Laptop Manual Mode into Add Asset as one page |
| [[Journal/2026-08-24]] | Phase 7 and Phase 1 isolated clean-worktree commits; database release gates remain open |
| [[Journal/2026-08-23]] | Phases 1–7 local implementation and Phase 6 final quality-gate evidence; release gates remain open |
| [[Journal/2026-08-22]] | Manual Mode + Belarc-assisted inventory expansion approved as vault plan |
| [[Journal/2026-08-02]] | Department Management local implementation and bulk import removal evidence |
| [[Journal/2026-07-27]] | Context source of truth, agent pipeline, and hosting plan |
| [[Journal/2026-08-01]] | Belarc source merge verification and remaining licensing/check limits |
| [[Journal/2026-07-06]] | Hardware Audit Phase A — Belarc parser built + tested |
| [[Journal/2026-07-03]] | Dashboard WIP + Reports wired |
| [[Journal/2026-06-28]] | Catch-up entry — full history reconstructed from git log |

### Decisions

| File | Description |
|------|-------------|
| [[Decisions/README]] | ADR index + key decisions already made |
| [[Decisions/2026-06-28-reports-merged-into-dashboard]] | Merge Reports Page into Dashboard |
| [[Decisions/2026-07-27-vercel-over-hostinger-deploy]] | Deploy to Vercel, not Hostinger |
| [[Decisions/2026-07-27-context-is-current-truth]] | Use Context.md for current truth and read-next routing |
| [[Decisions/2026-07-30-suspend-user-facing-scan-rollout]] | Suspend user-facing Scan System rollout |
| [[Decisions/2026-07-30-focused-commit-pr-workflow]] | Require one focused commit and pull request per change |
| [[Decisions/2026-08-22-manual-primary-belarc-assisted-intake]] | Manual Mode is the official intake source; Belarc is reviewed computer evidence only |

### Notes

| File | Description |
|------|-------------|
| [[Notes/README]] | Notes folder guide and suggested topics |
| [[Notes/Knowledge-Graph-and-Wiki]] | Obsidian wiki ownership, Graphify baseline, exclusions, and safe refresh policy |
| [[Notes/Hosting-Setup-Tutorial]] | Step-by-step Vercel, Render, Neon, Resend, staging, production, and DNS tutorial |
| [[Notes/Client-Account-Migration-Runbook]] | Client-owned Supabase + Vercel migration, verification, cutover, and rollback runbook |
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

- [[Journal/2026-08-25]] - Phase 5 migration blocked (Codex-owned); PR #22 + #23 merged (Branches modal fix, Departments); PR #24 folds Computer/Laptop Manual Mode into Add Asset
- [[Journal/2026-08-24]] - Phase 7 (`fcb49a9`) and Phase 1 (`1f6b6a6`) isolated and committed; no migration, push, or deployment
- [[Journal/2026-08-23]] - Phases 1–7 implemented locally; Phase 6 stock quality gate passed; no migration, commit, deployment, or production claim
- [[Journal/2026-08-22]] - Manual Mode + Belarc-assisted inventory expansion documented; Phase 1 and Phase 2-7 candidate specs added
- [[Journal/2026-08-02]] - Department Management locally implemented and reviewed; bulk import removed from code/schema with unapplied forward-only Supabase migration

- [[Journal/2026-08-01]] - Belarc source merge verified; commercial licensing and Svelte check limits remain open
- [[Journal/2026-07-30]] - User-facing Scan System suspension and Belarc/workbook planning focus
- [[Journal/2026-07-29]] - Supabase baseline, role accounts, Vercel gateway repair, and client-account migration runbook
- [[Journal/2026-07-28]] - Vercel + Supabase foundation, baseline and deployment gates

- [[Journal/2026-07-27]] — Context source of truth · Sales App-style agent presets · Vercel + Render + Neon hosting plan
- [[Journal/2026-07-06]] — Hardware Audit COMPLETE (A–E) · Activity Log verified already fully wired (docs were stale — Phase 8 now complete) · fixed stale super_admin permissions in dev DB
- [[Journal/2026-07-03]] — Dashboard complete · `/reports` deleted per ADR · Export CSV + DateRangePicker added to dashboard header
- [[Journal/2026-06-28]] — Catch-up: full history reconstructed from git log
