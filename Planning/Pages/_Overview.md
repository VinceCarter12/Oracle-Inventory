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

---

## Branches
- [ ] [Easy] Confirm cubao branch in seed data
- [ ] [Hard] Geographic map — all branches as pins
- [ ] [Hard] Clickable branch pins → branch detail
- [ ] [Medium] Branch detail: asset count + employee count
- [ ] [Medium] Branch detail: top asset categories
- [ ] [Very Hard] Mapbox integration (decision pending)

---

## Roles
- [ ] [Medium] Enforce one SuperAdmin only
- [ ] [Easy] Confirm all 5 role types exist: SuperAdmin, Admin, Staff, Viewer, Scanner
- [ ] [Medium] Add Viewer role (read-only)
- [ ] [Medium] Add Scanner role (scan pages only)
- [ ] [Easy] Role type color badge on list
- [ ] [Medium] Permission toggle UI improvement (switches)
- [ ] [Easy] Role description shown on list

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
- [ ] [Medium] Wire activity log list to `/api/activity`
- [ ] [Medium] Show real timestamps + user names from backend
- [ ] [Medium] Filter by user
- [ ] [Medium] Filter by action type
- [ ] [Medium] Filter by entity type
- [ ] [Easy] Date range filter
- [ ] [Easy] Confirm no delete endpoint exposed in UI
- [ ] [Hard] Archive old logs (toggle archived view)
- [ ] [Medium] Per-asset activity log on asset detail
- [ ] [Medium] Per-employee activity log on employee detail

---

## Scan System
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
- [ ] [Easy] Fix import column mapping missing field display
- [ ] [Medium] Fix employee first name detection on bulk upload
- [ ] [Easy] Fix import error messages (specific row/column)
- [ ] [Easy] Drag-and-drop file upload zone
- [ ] [Medium] Pre-import preview table
- [ ] [Medium] Per-row status in preview (Duplicate / Skip / Import / Error)
- [ ] [Medium] Skip individual rows before import
- [ ] [Hard] Edit rows inline in preview before import
- [ ] [Easy] Import progress indicator
- [ ] [Medium] Retry failed rows from history detail

---

## Hardware Audit *(new — Phase 11)* ✅ COMPLETE 2026-07-06 (A–E)
> Full plan + wireframes: [[Planning/Pages/HardwareAudit]]

> **2026-07-03**: No manual baseline entry — first accepted scan IS the baseline. Verified against a real Belarc export.
> **2026-07-06**: All phases A–E built and tested (unit tests + live/browser verification). Email-on-mismatch notification (open question) skipped for now per Vince.

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
- [ ] [Medium] Choose SvelteKit adapter (adapter-node vs adapter-vercel)
- [ ] [Easy] Revert dev/test values before production
- [ ] [Easy] Secure JWT_SECRET in production .env
- [ ] [Easy] Set CORS_ORIGIN to production domain
- [ ] [Medium] Set up PostgreSQL on production host
- [ ] [Medium] Run prisma db push + seed on production
- [ ] [Medium] Configure Gmail SMTP for production
- [ ] [Easy] Verify OTP email delivers on production
- [ ] [Medium] Deploy oracle-api with PM2
- [ ] [Medium] Build and deploy oracle-sv frontend
- [ ] [Easy] Verify all API calls use production URL
- [ ] [Easy] Test login → dashboard on production
- [ ] [Easy] Test OTP password reset on production
- [ ] [Hard] Set up SSL / HTTPS on Hostinger
- [ ] [Medium] Set up uptime monitoring (UptimeRobot)
