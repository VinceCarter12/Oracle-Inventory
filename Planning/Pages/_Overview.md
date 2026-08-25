---
date: 2026-07-06
tags: [planning, overview]
---

# Oracle Inventory — Feature Overview

> Master checklist across all pages. Check here AND in the per-page file when an item is done.
> Difficulty: `[Easy]` `[Medium]` `[Hard]` `[Very Hard]`

---

## Dashboard
- [x] [Medium] Merge `/reports` analytics into dashboard layout
- [x] [Easy] Remove `/reports` route from sidebar nav
- [x] [Medium] Wire activity bar chart to real backend data
- [x] [Medium] Wire condition donut chart to live asset counts
- [x] [Easy] Summary counters: Total, Assigned, Available, Under Repair, For Disposal
- [x] [Medium] Category / brand breakdown chart
- [x] [Medium] Utilization metrics panel
- [x] [Medium] By-branch asset summary
- [x] [Medium] By-department asset summary
- [x] [Hard] Assignment history widget
- [x] [Hard] Condition trend chart (new endpoint needed)
- [x] [Hard] Movement frequency panel (new endpoint needed)

---

## Assets
- [ ] [Easy] Fix asset count showing wrong total
- [ ] [Easy] Fix status not updating to Available after return
- [ ] [Medium] Warranty expiry date field
- [ ] [Medium] Purchase date field
- [ ] [Easy] Description / notes field
- [ ] [Hard] Photo upload field
- [ ] [Easy] Asset type code field (B/L)
- [ ] [Medium] BYOD ownership flag clearly shown in UI
- [ ] [Hard] Auto-generate asset tags `OPC-[branch]-[4-digit]`
- [ ] [Hard] EAN-13 barcode generation from asset tag
- [ ] [Hard] Print-ready label layout
- [ ] [Easy] Inspect quick-view button on list row
- [ ] [Hard] Maintenance record per asset
- [ ] [Medium] Maintenance history tab on asset detail
- [ ] [Medium] Annual refresh flag
- [ ] [Medium] Per-asset activity log on detail page
- [ ] [Hard] CCTV extra fields (manufacturer, IP, storage, FPS, night vision, motion)
- [ ] [Medium] Show CCTV fields only when category = CCTV
- [ ] [Medium] Top-level category groups
- [ ] [Easy] Sub-category support
- [ ] [Hard] Implement workbook-driven Asset detail sections: overview, lifecycle, specs, connectivity, audit/source confidence, maintenance
- [ ] [Hard] Add repeatable component records for RAM, storage, monitors, docks, and serialized peripherals
- [ ] [Hard] Add source-confidence review for manual vs Belarc proposed computer fields

---

## Assignments
- [ ] [Easy] Fix status not auto-changing to Available after return approved
- [ ] [Easy] Fix assignment date not editable on assign form
- [ ] [Medium] One asset per active assignment enforced
- [ ] [Medium] Employee search: filter by name + branch simultaneously
- [ ] [Medium] Return flow auto-sets asset to Available
- [ ] [Hard] Exit check / hardware scan on return → see [[Planning/Pages/HardwareAudit]]
- [ ] [Medium] Direct transfer workflow (no return needed)
- [ ] [Easy] Assignment count shown inline on assign form

---

## Employees
- [ ] [Medium] Fix bulk upload first name not detected
- [ ] [Easy] Fix Kobao branch missing from filter dropdown
- [ ] [Easy] Fix employee count showing incorrect total
- [ ] [Easy] Email field visible and editable on profile
- [ ] [Medium] Device assignment history tab on detail
- [ ] [Medium] Maintenance history tab on detail
- [ ] [Hard] Exit check / offboarding workflow → see [[Planning/Pages/HardwareAudit]]
- [ ] [Easy] Employee status badge on list and profile
- [ ] [Medium] Add employee identity fields from workbook: employee number, branch/site, department, position, email
- [ ] [Medium] Show expanded assignment groups: company devices, BYOD, peripherals, infrastructure responsibility

---

## Departments
- [x] [Medium] Dedicated Department Management page and sidebar entry implemented locally
- [x] [Medium] Create, rename, archive, and delete flows implemented locally
- [x] [Medium] Employee resolution implemented: reassign employees or clear department assignment
- [x] [Medium] Transactional ActivityLog records implemented for department mutations
- [x] [Medium] Local Prisma migration and focused tests/build passed
- [ ] [Medium] Implement approved Department UI/API remediation wireframe: clearer lifecycle states, destructive-action resolution, validation copy, and failure states
- [ ] [Medium] Validate remediation with focused Department API tests, frontend check, and browser smoke across create/rename/archive/unarchive/delete paths
- [ ] [Hard] Create/apply canonical Supabase migration and verify against target database

---

## Branches
- [ ] [Medium] Apply `manage_branches` migration, assign the intended role(s), and browser/API-smoke-test Add Branch with exact map pin (code and unit tests complete 2026-07-30)
- [ ] [Easy] Confirm cubao branch in seed data
- [ ] [Hard] Geographic map — all branches as pins
- [ ] [Hard] Clickable branch pins → branch detail
- [ ] [Medium] Branch detail: asset count + employee count
- [ ] [Medium] Branch detail: top asset categories
- [ ] [Very Hard] Mapbox integration (decision pending)
- [ ] [Hard] Add branch infrastructure summary: network devices, CCTV/NVR, servers, ISP circuits, and tool/stock counts

---

## Roles
- [ ] [Medium] Enforce one SuperAdmin only
- [ ] [Easy] Confirm all 5 role types exist: SuperAdmin, Admin, Staff, Viewer, Scanner
- [ ] [Medium] Add Viewer role (read-only)
- [ ] [Medium] Add Scanner role (scan pages only)
- [ ] [Easy] Role type color badge on list
- [ ] [Medium] Permission toggle UI improvement (switches)
- [ ] [Easy] Role description shown on list
- [ ] [Hard] Add expansion permissions for inventory intake, Belarc review, infrastructure edit, sensitive network fields, and secret references

---

## Inventory Intake
> Local implementation candidates recorded 2026-08-23. Specs: [[Planning/Pages/Inventory-Intake]], [[Planning/Inventory-Field-Dictionary]], [[Planning/Phase-1-Computer-Intake-Spec]], [[Planning/Phase-2-Belarc-Proposal-Hardening-Spec]], [[Planning/Phase-3-Network-Infrastructure-Spec]], [[Planning/Phase-4-CCTV-NVR-Spec]], [[Planning/Phase-5-Servers-Firewall-ISP-Spec]], [[Planning/Phase-6-Tools-and-Stock-Spec]], and [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]]. Checkbox completion below means code is present locally; it does not mean migration, commit, browser test, staging, or production release is complete. On 2026-08-24 the owner approved bypassing separate staging because the live project is unused; canonical migration reconciliation, restorable backup/export, feature-off production deployment, smoke tests, rollback ownership, and the Phase 2 licensing gate remain mandatory. See [[Journal/2026-08-24]].

- [x] [Hard] Phase 1: implement company computer/laptop Manual Mode with branch required, assetTag canonical, duplicate computer-name warning, optional assignment, review summary, and activity log — applied to the unused production database as migration `20260823175443`; matching pushed commit `3de1028` is not merged, browser-verified, or release-verified
- [x] [Hard] Phase 2 candidate: implement production-disabled Belarc proposal hardening with license gate, allowlist, redaction, provenance, review, conflicts, and rollback — local candidate; must remain disabled
- [x] [Very Hard] Phase 3 candidate: implement network infrastructure interfaces, IP observation history, VLANs, switch ports, topology links, and branch connectivity — local candidate
- [x] [Hard] Phase 4 candidate: implement CCTV/NVR cameras, recorder profiles, explicit channel assignments, physical locations, network references, and secret-reference-only rules — local candidate
- [x] [Very Hard] Phase 5 candidate: implement servers, firewall profiles, ISP circuits, modem/router relationships, addressing modes, and restricted sensitive infrastructure fields — local candidate
- [x] [Hard] Phase 6 candidate: implement tagged Asset versus quantity-managed stock decision flow, stock locations, double-entry ledger movements, count approval, derived balances, and low-stock policies — schema applied to unused production target as `20260823184250` by explicit owner schedule exception, with flags off, RLS enabled, and no public grants; application route/page/test scope remains incomplete and is not release-ready
- [x] [Hard] Phase 7 candidate: implement cross-phase release controls with feature flags, staging, pilot branch rollout, backup/restore evidence, observability, rollback, and acceptance gates — applied to the unused production database as migration `20260823175436`; matching pushed commit `799689f` is not merged or release-verified
- [ ] [Hard] Implement Manual Mode as primary official intake for computers, peripherals, network devices, CCTV/NVR, servers, ISP circuits, and tools
- [ ] [Hard] Implement step-based intake wizard with draft save, category-specific fields, relationship mapping, and review summary
- [ ] [Hard] Implement Belarc-assisted computer field proposals without silent overwrite
- [ ] [Hard] Reject raw credential fields and store only secret-reference metadata
- [ ] [Very Hard] Add normalized models for device profiles, components, network interfaces, port relationships, CCTV/NVR channels, ISP circuits, and tool inventory
- [ ] [Medium] Add UI source labels for Manual, Belarc, Existing, Proposed, Verified, and Conflict

---

## Users
- [ ] [Easy] Confirm user status badge displays correctly
- [ ] [Easy] Show last login time on user detail
- [ ] [Easy] Show "must change password" flag
- [ ] [Medium] Filter users by role and branch
- [ ] [Medium] Block Admin from creating second SuperAdmin
- [ ] [Easy] Resend onboarding email from user detail

---

## Activity Log
- [x] [Medium] Wire activity log list to `/api/activity` ✅ verified 2026-07-06 — was already fully wired (likely built with initial SvelteKit rewrite, docs never caught up); confirmed live: 280 real entries, real network calls
- [x] [Medium] Show real timestamps + user names from backend ✅ verified 2026-07-06 — real timestamps + `user.name` rendered per row
- [ ] [Medium] Filter by user — dedicated user dropdown not present (only entity/action-text/date range exist)
- [x] [Medium] Filter by action type ✅ free-text "Filter by action…" input, backend does case-insensitive `contains` match — verified working
- [x] [Medium] Filter by entity type ✅ verified live 2026-07-06 — dropdown populated from `/api/activity/entities`, selecting "Employee" correctly filtered 280→79 entries via `GET /api/activity?entity=Employee`
- [x] [Easy] Date range filter — `DatePicker` from/to wired to `from`/`to` query params, same pattern as verified entity filter
- [x] [Easy] Confirm no delete endpoint exposed in UI ✅ confirmed — `activity.ts` only exposes `GET /` and `GET /entities`, no delete route exists
- [ ] [Hard] Archive old logs (toggle archived view)
- [ ] [Medium] Per-asset activity log on asset detail
- [ ] [Medium] Per-employee activity log on employee detail

---

## Scan System
> **Suspended 2026-07-30**: User-facing QR/OCR Scan System work and rollout for `/assets/scan`, `/scan/mobile`, and `/scan/review` are frozen pending a later owner decision. Do not delete existing code/scaffolds. Belarc Hardware Audit is separate and remains active.

- [ ] [Medium] Wire `/scan/mobile` to scan room backend
- [ ] [Medium] Wire `/scan/review` admin queue to backend
- [ ] [Hard] Multi-device scan room (1–5 devices)
- [ ] [Medium] Flashlight toggle on mobile scan
- [ ] [Hard] 100+ bulk scan support
- [ ] [Hard] Admin review queue fully functional
- [ ] [Medium] QR → phone handoff (desktop shows room code QR)
- [ ] [Easy] Room expiry countdown on mobile
- [ ] [Medium] Unknown scan alert for unmatched asset tags

---

## Auth
- [ ] [Easy] Confirm first-login redirect works
- [ ] [Hard] OTP login route `/otp-login` (passwordless)
- [ ] [Medium] "Login with OTP" link on `/login` page
- [ ] [Medium] OTP expiry + one-time use enforced in UI
- [ ] [Easy] Clear error messages for expired/used OTP
- [ ] [Medium] Session timeout → auto-redirect to login

---

## Import
> Removed 2026-08-02 by owner decision. Do not rebuild bulk upload unless a new decision explicitly reverses this.

- [x] [Hard] Remove bulk import frontend routes, navigation entry, history/detail screens, and upload flow
- [x] [Hard] Remove backend import routes, parsing/import services, mapping presets, history endpoints, and templates
- [x] [Hard] Remove Prisma import models/enums/relations from source schema while preserving actual assets and activity logs
- [x] [Medium] Create forward-only Supabase migration for the next database account; current Supabase test DB intentionally not touched
- [x] [Medium] Verify removal: API build/tests passed; frontend check reported 0 errors with existing warnings

---

## Hardware Audit *(new — Phase 11)* ✅ COMPLETE 2026-07-06 (A–E)
> Full plan + wireframes: [[Planning/Pages/HardwareAudit]]

> **2026-07-03**: No manual baseline entry — first accepted scan IS the baseline. Verified against a real Belarc export.
> **2026-07-06**: All phases A–E built and tested (unit tests + live/browser verification). Email-on-mismatch notification (open question) skipped for now per Vince.
> **2026-08-01**: Source merge verified: selectable safe Belarc fields, blank official fields can be filled, equal values verified, conflicting nonblank values blocked, scan/update transaction with latest-state recompute, no migration. API tests/build passed; frontend Svelte check remains blocked by pre-existing style resolver/access errors.

### Phase A — Belarc Parser
- [x] [Hard] Install HTML parser (`node-html-parser` or `cheerio`) in oracle-api
- [x] [Hard] Write `parseBelarc(html)` — selects `.reportSection` divs, extracts 21 recorded sections
- [x] [Easy] Verify against real Belarc export — done with `(Carter).html`
- [x] [Medium] Tag fields with volatility tier (hard/soft/skip) + handle missing sections

### Phase B — Scan Upload + Baseline
- [x] [Hard] Add `HardwareScan` Prisma model (`isBaseline`, `rawHtml`)
- [x] [Hard] `POST /api/hardware-audit/scan` — multipart upload, parse, store, compare if baseline exists
- [x] [Medium] `PUT /api/hardware-audit/scans/:id/baseline` — accept as baseline
- [x] [Hard] `/hardware-audit/upload` — 3-step upload page (select asset → upload → preview)
- [x] [Medium] "Hardware" tab on `/assets/[id]` — baseline specs + scan history (read-only)

### Phase C — Comparison Engine
- [x] [Hard] Field-by-field diff: new scan vs baseline scan (parsed JSON)
- [x] [Medium] Volatility tiers — hard → 🔴 mismatch, soft → 🟡 warning, skip → ignored

### Phase D — Admin Review Queue
- [x] [Medium] `GET /api/hardware-audit/scans` — list with filters
- [x] [Easy] `PUT /api/hardware-audit/scans/:id/review` — reviewed / flagged / archived
- [x] [Hard] `/hardware-audit` — queue page with severity sorting + summary chips
- [x] [Hard] `/hardware-audit/[scanId]` — comparison detail, row-by-row diff, 🟢🟡🔴 badges
- [x] [Easy] Sidebar badge for pending mismatches

### Phase E — Exit Check Integration
- [x] [Very Hard] Require hardware scan before employee offboarding completes
- [x] [Hard] Block return approval until scan submitted and reviewed

---

## Deployment
- [x] [Medium] Choose SvelteKit adapter — `adapter-vercel` accepted 2026-07-27
- [ ] [Easy] Revert dev/test values before production
- [ ] [Easy] Secure JWT_SECRET in production .env
- [ ] [Easy] Set CORS_ORIGIN to production domain
- [ ] [Medium] Set up PostgreSQL on production host
- [ ] [Medium] Run prisma db push + seed on production
- [ ] [Medium] Configure Gmail SMTP for production
- [ ] [Easy] Verify OTP email delivers on production
- [x] [Medium] Deploy `oracle-api` to Render — Live 2026-07-27; `/health` verified
- [ ] [Medium] Promote the Vercel Node 20 runtime fix to `main` and obtain a successful Production frontend deploy (Preview `81136f2` is Ready)
- [ ] [Easy] Verify all API calls use production URL
- [ ] [Easy] Test login → dashboard on production
- [ ] [Easy] Test OTP password reset on production
- [ ] [Hard] Configure custom-domain DNS/TLS on Vercel after production smoke tests
- [ ] [Medium] Set up uptime monitoring (UptimeRobot)
