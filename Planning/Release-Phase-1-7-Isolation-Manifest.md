---
date: 2026-08-23
tags: [planning, release, git]
---

# Release Phase 1–7 Isolation Manifest

> Purpose: turn the locally implemented workbook expansion into small, reviewable commits without mixing unrelated shared-worktree changes. This is an isolation plan, not a release approval.
>
> Current branch: `codex/release-phase1-3`. The worktree is mixed and must never be staged with `git add -A`.

## Verified Boundary

The local candidate batch covers [[Planning/Phase-1-Computer-Intake-Spec]], [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]], [[Planning/Phase-2-Belarc-Proposal-Hardening-Spec]], [[Planning/Phase-3-Network-Infrastructure-Spec]], [[Planning/Phase-4-CCTV-NVR-Spec]], [[Planning/Phase-5-Servers-Firewall-ISP-Spec]], and [[Planning/Phase-6-Tools-and-Stock-Spec]]. API build, Prisma validation, and 65 focused API tests passed after Phase 6. See [[Journal/2026-08-23]].

Unrelated WIP currently includes import removal, department/auth/hardware-audit changes, historical vault documentation, and temporary logs. None of those belong in an expansion commit unless a line-level dependency review proves otherwise.

## Commit Order and Owned Paths

| Order | Focused change | Primary owned paths | Shared files needing line-level staging |
|---|---|---|---|
| 1 | Phase 1 — Computer Manual Mode | `prisma/migrations/20260822120000_computer_intake/`, `src/routes/computer-intake.ts`, `src/routes/(dashboard)/assets/add/computer/` | `prisma/schema.prisma`, `src/app.ts`, `src/lib/api.ts`, sidebar/layout files |
| 2 | Phase 7 — Release foundation | `prisma/migrations/20260822130000_phase7_rollout_foundation/`, `src/routes/operations.ts` | `prisma/schema.prisma`, `src/app.ts` |
| 3 | Phase 2 — Belarc hardening, disabled | `prisma/migrations/20260822140000_belarc_proposal_hardening/`, Belarc-specific route/service/test hunks | `prisma/schema.prisma`, `src/app.ts`, Hardware Audit UI/API hunks |
| 4 | Phase 3 — Network infrastructure | `prisma/migrations/20260822150000_network_infrastructure/`, `src/routes/network.ts`, `src/routes/network-mutations.ts`, `src/routes/(dashboard)/network/` | `prisma/schema.prisma`, `src/app.ts`, `src/lib/api.ts`, sidebar/permission hunks |
| 5 | Phase 4 — CCTV/NVR and secret references | `prisma/migrations/20260823090000_cctv_nvr_foundation/`, `src/routes/cctv.ts`, `src/routes/secret-reference.ts`, `src/routes/(dashboard)/cctv/` | `prisma/schema.prisma`, `src/app.ts`, sidebar/permission hunks |
| 6 | Phase 5 — Servers, firewall, ISP | `prisma/migrations/20260823100000_servers_firewall_isp/` and later Phase 5 corrective migrations, `src/routes/infrastructure.ts`, `src/routes/(dashboard)/infrastructure/` | `prisma/schema.prisma`, `src/app.ts`, `src/lib/api.ts`, sidebar/permission hunks |
| 7 | Phase 6 — Tools and stock | `prisma/migrations/20260823160000_tools_stock_foundation/`, `src/routes/stock.ts`, `src/routes/(dashboard)/stock/`, `src/routes/(dashboard)/inventory/intake/tools-stock/` | `prisma/schema.prisma`, `src/app.ts`, `src/lib/api.ts`, sidebar/permission hunks |

## Isolation Rules

1. Inspect `git diff` for every listed file before staging; shared files require hunk-level staging only.
2. Do not stage `.env*`, `.codex-*.log`, `node_modules`, bulk-import removal, or unrelated vault/history files.
3. Each commit must build, validate Prisma, run its focused tests, and receive a quality review before moving to the next commit.
4. Additive migrations remain local until the clean staging migration and restore gate has passed.
5. Default feature flags remain off. Phase 2 Belarc must remain disabled until commercial rights and raw-evidence retention governance are approved.

## Gates After Commit Isolation

- Linux/CI-style frontend check; the current Windows Svelte/esbuild access failure is not a pass.
- Authenticated route tests for branch scope/IDOR, CAS, idempotency, and stock concurrency.
- Clean staging migration dry run and backup/restore proof.
- Browser/API role smoke tests and approved pilot rollout.

[[Home]] | [[Context]] | [[Planning/PLAN]] | [[Planning/Pages/_Overview]] | [[Journal/2026-08-23]]
