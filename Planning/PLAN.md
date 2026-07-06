# Oracle Inventory System — Master Plan (V2)

> **Version**: 2.0 (updated 2026-06-28 to reflect actual codebase state)
> **Project**: Oracle Inventory
> **Repository**: [github.com/VinceCarter12/Oracle-Inventory](https://github.com/VinceCarter12/Oracle-Inventory)
> **Live Domain**: `oracleinventory.lubesmastery.com` (Hostinger FTP — legacy; SvelteKit adapter TBD)

---

## 1. Product Vision

Oracle Inventory is a **web-based asset tracking system** for organizations that manage physical equipment (laptops, monitors, peripherals) across multiple branches and employees. V2 adds multi-user RBAC, OTP auth, bulk import, QR/barcode scanning, and a full audit trail.

### Target Users

- **SuperAdmin** — Sir Jay (IT manager). Full access across all branches.
- **Admin** — Branch managers. Scoped to their branch.
- **Staff** — View-only or limited permissions via role assignment.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Inventory v1 (monorepo)                 │
│                                                          │
│  ┌─────────────┐    ┌─────────────┐                      │
│  │  oracle-sv   │    │  oracle-api  │                     │
│  │  (SvelteKit) │───▶│  (Express)   │                     │
│  │  Port 5173   │    │  Port 3001   │                     │
│  └─────────────┘    └──────┬───────┘                     │
│                            │                              │
│                     ┌──────▼───────┐                      │
│                     │  PostgreSQL   │                      │
│                     │  (Neon/Supa)  │                      │
│                     │  via Prisma   │                      │
│                     └──────────────┘                      │
└──────────────────────────────────────────────────────────┘
```

| Layer | Package | Tech |
|-------|---------|------|
| **Frontend** | `oracle-sv` | SvelteKit 5 + Svelte 5 (runes), Tailwind CSS v4, Vite 6, TypeScript |
| **API** | `oracle-api` | Express 4, Prisma 7 (PostgreSQL adapter), JWT auth, bcrypt, TypeScript |
| **Database** | — | PostgreSQL (cloud — Neon or Supabase), managed via Prisma schema |
| **Email** | — | Gmail SMTP via Nodemailer (OTP, maintenance alerts, onboarding) |
| **OCR** | — | Tesseract.js (in-process, no external service) |

### Key Decisions

- **Svelte 5 runes** (`$state`, `$derived`, `$props`) — no legacy stores
- **Tailwind v4** via `@tailwindcss/vite` plugin — `@theme` block registers design tokens
- **No component library** — all components handwritten using `Design/DESIGN.md`
- **JWT-based auth** — `Authorization: Bearer <token>` on all protected API calls
- **OTP via Gmail** — `request-otp`, `forgot-password`, `reset-password` endpoints wired to Resend/Gmail
- **Branches not Sites** — V2 replaced the `Site` model with `Branch` everywhere
- **RBAC via Role + Permission** — granular permission keys (e.g. `view_inventory`, `create_inventory`) with per-user overrides

---

## 3. Data Model

Defined in `oracle-api/prisma/schema.prisma` — **15 models, 8 enums**.

### RBAC & Users

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `SystemUser` | Multi-user accounts | email, password, roleId, branchId, status, mustChangePassword |
| `Role` | Named role definitions | name, description |
| `Permission` | Granular permission keys | key (e.g. `view_inventory`) |
| `RolePermission` | Role → Permission mapping | roleId, permissionId |
| `UserPermission` | Per-user overrides | userId, permissionId, granted (bool) |

### Inventory Core

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Asset` | Physical equipment | name, serialNumber, categoryId, branchId, status (active/lost/stolen), condition, ownership, assetTag, importId |
| `AssetAssignment` | Employee → Asset | assetId, employeeId, status (active/returned/transferred/pending_return), returnRequestedAt |
| `Category` | Asset type | name |

### Organization

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Employee` | Staff roster | name, email, employeeId, departmentId, branchId, isActive, source (manual/import) |
| `Department` | Org unit | name |
| `Branch` | Physical location (V2) | name, address, lat/lng, archivedAt |

### Audit & Workflows

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `ActivityLog` | User action audit trail | userId, action, entity, entityId, metadata (JSON) |
| `MovementLog` | Asset movement history | assetId, employeeId, type, notes |
| `OtpCode` | One-time passwords | email, purpose, code, expiresAt, used |

### Import System

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `ImportHistory` | Bulk upload job | fileName, totalRows, importedRows, failedRows, status, strictMode |
| `ImportRow` | Per-row result | rawData, mappedData, outcome, assetId, errorMessage, isDuplicate |
| `ColumnMappingPreset` | Saved column mappings | name, mappings (JSON), isShared |

### Scan System

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `ScanRoom` | Multi-device scan session | roomCode, ownerId, status, maxDevices, expiresAt |
| `ScanDevice` | Connected mobile | deviceToken, roomId, status, lastSeenAt |
| `ScanResult` | Scan output | roomId, deviceId, parsedData (JSON), status, assetId |

### Enums

| Enum | Values |
|------|--------|
| `AssetCondition` | usable, for_repair, for_disposal |
| `OwnershipType` | company, personal |
| `MovementType` | assignment, transfer, site_transfer, resignation, new_hire, repair_send, repair_return, disposal, lost_report, stolen_report, recovery, return_requested, return_approved, return_rejected |
| `AssignmentStatus` | active, returned, transferred, pending_return |
| `AssetStatus` | active, lost, stolen |
| `UserStatus` | active, inactive, suspended |
| `ImportStatus` | pending, processing, completed, partial, failed |
| `RowOutcome` | imported, skipped, failed, duplicate, overwritten |

---

## 4. Design System

Fully documented in `Design/DESIGN.md` — Vercel-inspired, applied to an inventory context.

| Category | Tokens |
|----------|--------|
| **Surfaces** | `--canvas`, `--canvas-soft`, `--canvas-soft-2` |
| **Text** | `--ink`, `--body`, `--mute`, `--on-primary` |
| **Borders** | `--hairline`, `--hairline-strong` |
| **Semantic** | `--link`, `--error`, `--error-soft` |
| **Charts** | `--chart-usable`, `--chart-repair`, `--chart-disposal` |
| **Radius** | `--r-xs` → `--r-full` |
| **Spacing** | `--sp-xxs` → `--sp-5xl` |
| **Shadows** | `--shadow-l1` → `--shadow-l5` |
| **Fonts** | Inter (sans), JetBrains Mono (mono) |

---

## 5. Route Map

### Frontend Routes (`oracle-sv`) — 31 pages

#### Auth Group (public)
| Route | Status | Description |
|-------|--------|-------------|
| `/login` | ✅ Done | JWT login, branded split-panel |
| `/forgot-password` | ✅ Done | Password reset flow |
| `/first-login` | ✅ Done | New user onboarding |

#### Dashboard Group (protected)
| Route | Status | Description |
|-------|--------|-------------|
| `/dashboard` | ✅ Done | KPI cards, condition donut, activity bar chart, movement table |
| `/assets` | ✅ Done | Asset table, search/filter, bulk actions |
| `/assets/[id]` | ✅ Done | Asset detail + assignment history |
| `/assets/add` | ✅ Done | New asset form |
| `/assets/scan` | ✅ Done | QR/barcode scanner (mobile-optimized, Tesseract OCR) |
| `/assets/import` | ✅ Done | Excel/CSV bulk import UI |
| `/assets/import/history` | ✅ Done | Import job history list |
| `/assets/import/history/[id]` | ✅ Done | Import job detail + conflict resolution |
| `/employees` | ✅ Done | Employee list with working filter dropdowns |
| `/employees/[id]` | ✅ Done | Employee profile + assigned assets |
| `/assignments` | ✅ Done | Assignments table with return workflow |
| `/assignments/assign` | ✅ Done | New assignment form |
| `/assignments/confirm` | ✅ Done | Return/transfer confirmation |
| `/branches` | ✅ Done | Branch management |
| `/branches/[id]` | ✅ Done | Branch detail |
| `/roles` | ✅ Done | Role management + permission matrix |
| `/users` | ✅ Done | User management |
| `/users/[id]` | ✅ Done | User detail/edit |
| `/reports` | ❌ Removed | Deleted 2026-07-03 per ADR — metrics merged into `/dashboard`, Export CSV in dashboard header |
| `/settings` | ✅ Done | Workspace, Integrations, Security tabs |
| `/activity` | 🔶 Scaffolded | Activity log viewer — backend done, frontend minimal |

#### Scan Group (mobile layout)
| Route | Status | Description |
|-------|--------|-------------|
| `/scan/mobile` | 🔶 Scaffolded | Mobile scan handoff — backend done, frontend minimal |
| `/scan/review` | 🔶 Scaffolded | Admin scan result review queue |

---

## 6. API Endpoints (`oracle-api`) — 16 route modules

| Module | Key Endpoints | Status |
|--------|--------------|--------|
| **auth** | POST /login, /request-otp, /forgot-password, /reset-password | ✅ Done |
| **assets** | CRUD + /report-lost, /report-stolen, /recover, /stats | ✅ Done |
| **assignments** | CRUD + /request-return, /approve-return, /reject-return, /pending-returns | ✅ Done |
| **employees** | Full CRUD + pagination/filtering | ✅ Done |
| **branches** | Full CRUD | ✅ Done |
| **departments** | Full CRUD | ✅ Done |
| **categories** | Full CRUD | ✅ Done |
| **users** | Full CRUD (multi-user management) | ✅ Done |
| **roles** | Full CRUD (role + permission matrix) | ✅ Done |
| **turnover** | POST /, GET /:id, PUT /:id/return, PUT /:id/approve, GET /pending | ✅ Done |
| **scan** | POST /room, GET /room/:roomCode, POST /device/connect, POST /result | ✅ Done |
| **import** | Bulk upload, history, failed rows, column mapping presets, templates | ✅ Done |
| **activity** | GET /, /by-entity/:entity/:entityId, /by-user/:userId | ✅ Done |
| **maintenance** | Full CRUD + cron scheduler on startup | ✅ Done |
| **reports** | GET /dashboard, /utilization, /by-branch, /by-department | ✅ Done |
| **lookup** | GET /employees, /assets, /branches, /departments, /categories | ✅ Done |

### Middleware

| File | Purpose |
|------|---------|
| `auth.ts` | `requireAuth()` — JWT validation; `requirePermission(key)` — RBAC checks |
| `hooks.server.ts` | SvelteKit route guard — session cookie check, redirects unauthenticated users |

---

## 7. Build Phases

### Phase 0 — Foundation ✅ COMPLETE
- [x] Monorepo structure (`oracle-sv`, `oracle-api`)
- [x] Prisma schema (15 models, 8 enums)
- [x] Design system (`Design/DESIGN.md`) + global CSS tokens
- [x] Git repo initialized

### Phase 1 — Auth + Shell ✅ COMPLETE
- [x] Login page (split-panel, branded, JWT flow)
- [x] Dashboard layout with collapsible sidebar
- [x] Root redirect `/` → `/login`
- [x] SvelteKit route guard (`hooks.server.ts`)

### Phase 2 — Dashboard ✅ COMPLETE
- [x] KPI cards, condition donut, activity bar chart, movement table
- [x] Dashboard aggregate API endpoints wired (`/api/reports/dashboard`)

### Phase 3 — API Layer ✅ COMPLETE
- [x] Express server with 16 route modules
- [x] JWT auth middleware + RBAC permission middleware
- [x] Auth routes (login, OTP, password reset)
- [x] All CRUD endpoints (assets, employees, assignments, branches, departments, categories)
- [x] Movement log + activity log endpoints

### Phase 4 — Asset Management ✅ COMPLETE
- [x] Assets page with table, search, filters
- [x] Asset detail page with assignment history
- [x] Create/edit asset form
- [x] Lost/stolen reporting + recovery workflow
- [x] OCR scan page (Tesseract.js, camera + upload modes, duplicate detection)
- [x] Excel/CSV bulk import (conflict resolution, column mapping presets, import history)

### Phase 5 — People & Assignments ✅ COMPLETE
- [x] Employees page with working filter dropdowns
- [x] Employee detail (assigned assets, movement history)
- [x] Assignments page with active table
- [x] Assign/transfer/return workflow (modal forms)
- [x] Return approval flow (request → approve/reject)
- [x] Turnover/resignation workflow

### Phase 6 — Organization & Users ✅ COMPLETE
- [x] Branches page (replaces Sites)
- [x] Branch detail
- [x] Department CRUD
- [x] Multi-user management (`/users`)
- [x] Role management with permission matrix (`/roles`)
- [x] Maintenance scheduling with email notifications (node-cron, Gmail SMTP)

### Phase 7 — OTP & Security ✅ COMPLETE
- [x] OTP endpoint (`/api/auth/request-otp`) wired to Gmail
- [x] Forgot password + reset password with real email delivery
- [x] First-login onboarding page
- [x] Settings page OTP flows (email/password change)

### Phase 8 — Reports & Activity Log 🔶 IN PROGRESS
- [x] Report aggregate endpoints (dashboard, utilization, by-branch, by-department)
- [x] Reports page scaffolded (`/reports`, `/reports/[id]`)
- [x] **Wire reports UI to backend data** — filters (branch, category, date range) refetch summary; CSV/PDF export working on both index and detail pages; 3 missing reports added to table (by-branch, employee-ownership, site-utilization)
- [x] Dashboard WIP committed — ChartBar, ChartDonut, SectionCard components; permission-safe activity fetch
- [x] `/api/reports/summary` — now accepts `branchId`, `categoryId`, `from`, `to` query params
- [x] Activity log backend (`/api/activity`)
- [x] Activity log page scaffolded (`/activity`)
- [ ] **Wire activity log UI to backend data**

### Phase 9 — Scan System 🔶 IN PROGRESS
- [x] Scan backend (rooms, devices, results)
- [x] Mobile scan page scaffolded (`/scan/mobile`)
- [x] Admin review queue scaffolded (`/scan/review`)
- [ ] **Wire scan UI to backend — multi-device room handoff**
- [ ] **Admin review queue fully functional**

### Phase 10 — Hardware Audit 🔶 IN PROGRESS
> Full plan + wireframes: `Planning/Pages/HardwareAudit.md`
> **2026-07-03**: No manual baseline entry — first accepted scan IS the baseline. Belarc HTML structure verified against a real export (`.reportSection` divs).
- [x] Phase A: Server-side Belarc HTML parser (`parseBelarc` — 21 recorded sections, volatility tiers) ✅ 2026-07-06 — `oracle-api/src/lib/belarc/`, 20 tests against real export fixture
- [ ] Phase B: `HardwareScan` model + upload page + accept-as-baseline flow + Hardware tab on asset detail
- [ ] Phase C: Comparison engine — new scan vs baseline scan (parsed JSON diff)
- [ ] Phase D: Admin review queue (`/hardware-audit`) + comparison detail (`/hardware-audit/[scanId]`)
- [ ] Phase E *(deferred)*: Exit check block on employee offboarding

### Phase 11 — Deployment 🔲 NOT STARTED
- [ ] Choose SvelteKit adapter (`adapter-node` for self-hosted or `adapter-vercel`)
- [ ] Configure production environment variables
- [ ] Set up PostgreSQL on production host
- [ ] Deploy API to hosting (VPS or Hostinger)
- [ ] Deploy frontend
- [ ] Verify OTP email on production Gmail account
- [ ] Revert any dev/test values (see Deployment TODOs memory)

---

## 8. Current State Summary

| Area | Status |
|------|--------|
| **Data model** | ✅ Complete — 15 models, 8 enums, seed data |
| **Design system** | ✅ Complete — documented in `Design/DESIGN.md`, CSS tokens, Tailwind v4 |
| **Auth (JWT)** | ✅ Complete — login, session guard, logout |
| **Auth (OTP)** | ✅ Backend complete — frontend flows wired in settings; OTP login page TBD |
| **RBAC** | ✅ Complete — Role + Permission models, middleware, per-user overrides, UI |
| **Asset management** | ✅ Complete — CRUD, lost/stolen/recovery, scan, bulk import |
| **Employee management** | ✅ Complete — CRUD, filter dropdowns, detail page |
| **Assignments** | ✅ Complete — assign, transfer, return, approval flow, turnover |
| **Branch/Dept management** | ✅ Complete — full CRUD |
| **Maintenance scheduling** | ✅ Complete — cron + email notifications |
| **Bulk import** | ✅ Complete — Excel/CSV, conflict resolution, presets, history |
| **Scan system** | 🔶 Backend done — UI needs wiring |
| **Reports** | ✅ Merged into Dashboard — `/reports` route deleted per ADR; backend endpoints feed dashboard + CSV export |
| **Activity log** | 🔶 Backend done — UI needs data wiring |
| **Hardware audit** | 🔶 Phase A done (Belarc parser + tests) — Phases B–D remain |
| **Deployment** | 🔲 Not started — SvelteKit adapter not chosen |

---

## 9. Remaining Work

| # | Task | Priority |
|---|------|----------|
| 1 | ~~Wire `/reports` to backend~~ — **DECISION**: Reports merged into Dashboard (see [[Decisions/2026-06-28-reports-merged-into-dashboard]]) | — |
| 1a | ~~Merge report metrics/charts into `/dashboard` layout~~ ✅ Done 2026-07-03 — all dashboard widgets built (utilization, by-dept, condition trend, movement frequency, assignment history) | — |
| 1b | ~~Remove `/reports` route from oracle-sv, update sidebar nav~~ ✅ Done 2026-07-03 — route deleted, Export CSV moved to dashboard header | — |
| 2 | Wire `/activity` log page to backend | Medium |
| 3 | Wire `/scan/mobile` and `/scan/review` to scan room backend | Medium |
| 4 | OTP login flow on frontend (passwordless entry point) | Medium |
| 5 | Choose SvelteKit adapter + configure deployment | High |
| 6 | Production env setup + deploy | High |
| 7 | Advanced map on Branch detail (Mapbox vs Leaflet — still evaluating) | Low |
| 8 | **Hardware Audit feature** — Phase A–D (see `Planning/Pages/HardwareAudit.md`) | Medium |

---

## 10. Open Decisions

| # | Question | Recommendation |
|---|----------|---------------|
| 1 | SvelteKit deployment adapter | `adapter-node` for Hostinger VPS; `adapter-vercel` if moving to Vercel |
| 2 | Map library for Branch detail | Leaflet (Nominatim, free) is live; Mapbox adds cost but better UX — decision pending |
| 3 | OTP login as primary entry point | Add `/otp-login` route once backend confirmed stable on prod |
| 4 | Scan system rollout | Wire admin review queue first before exposing mobile scan to users |

---

## 11. Environment Setup

### oracle-sv (Frontend)
```bash
cd oracle-sv
npm install
npm run dev          # http://localhost:5173
```

### oracle-api (Backend)
```bash
cd oracle-api
cp .env.example .env # Fill DATABASE_URL, JWT_SECRET, GMAIL_USER, GMAIL_PASSWORD
npm install
npx prisma db push   # Create tables
npm run db:seed       # Seed demo data
npm run dev           # http://localhost:3001
```

### Environment Variables (`oracle-api/.env`)
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=change_this_to_a_random_32_char_string
PORT=3001
CORS_ORIGIN=http://localhost:5173
GMAIL_USER=your_gmail@gmail.com
GMAIL_PASSWORD=your_app_password
```
