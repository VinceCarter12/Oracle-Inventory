---
date: 2026-07-27
tags: [planning, context]
---

# Oracle Inventory - Current Context

> Source of truth for current project reality and what to read next. Detailed status, rationale, specifications, and dated evidence remain in their assigned vault files.

## Current Truth

- **Product**: Oracle Inventory is evolving from asset tracking into a device and infrastructure operations system for computers, peripherals, network equipment, servers, CCTV/NVR, and related assets. This expanded scope is planned, not yet implemented.
- **Accepted target stack**: Vercel frontend with Supabase PostgreSQL. Prisma remains the API ORM/data model and the JWT API contract remains in place. Supabase owns the applied database migration history. Supabase Auth, Storage, Realtime, and Edge Functions are deferred.
- **Verified implementation**: Hardware Audit phases A-E and Activity Log wiring were code/test/browser verified on 2026-07-06. See [[Journal/2026-07-06]].
- **New workbook**: `Inventory Systems.xlsx` is a field/specification questionnaire, not an import-ready dataset. It includes device, network, CCTV, server, ISP, and tool requirements plus unsafe password fields. Password values must not enter inventory records, imports, logs, fixtures, or Graphify.
- **Manual + Belarc expansion decision**: On 2026-08-22, the workbook-driven expansion was approved as a vault plan. Manual Mode is the official primary intake source for expanded inventory. Belarc remains reviewed computer-hardware evidence only and cannot silently overwrite official values. See [[Planning/Inventory-Field-Dictionary]], [[Planning/Pages/Inventory-Intake]], and [[Decisions/2026-08-22-manual-primary-belarc-assisted-intake]].
- **Inventory expansion implementation state (2026-08-24)**: Canonical migration-history commit `d636a94`, Phase 7 release foundation `799689f`, and Phase 1 computer intake `3de1028` form the clean release chain and are pushed to GitHub. The owner-approved production-only path applied the additive `manage_branches`, Phase 7, and Phase 1 migrations to the unused Tokyo Supabase project as versions `20260823175404`, `20260823175436`, and `20260823175443`; the tables are empty, RLS is enabled, and public client grants are absent. Feature flags remain off. API build, Prisma validation, and 148 API tests passed; local frontend check remains blocked by a Windows/esbuild workspace-access failure. No PR has been merged and no app deployment has occurred; Phases 2–6 remain local candidates in the shared working tree. See [[Journal/2026-08-24]] and [[Journal/2026-08-23]].
- **Phase 6 production schema exception (2026-08-24)**: The owner explicitly approved applying the isolated Tools & Stock migration before merge because of schedule pressure. Version `20260823184250_phase6_tools_stock_foundation` is applied to the same unused Tokyo project; all seven stock tables are empty, RLS is enabled, public `anon`/`authenticated` grants are absent, and the two new stock permissions exist. Matching branch `codex/phase6-tools-stock` was committed as `3b816ea` and pushed. The application rollout remains disabled because `STOCK_TOOLS_ENABLED` is not enabled and no `FeatureRollout` record was created. The branch has known incomplete route/page/test scope; do not represent Phase 6 as production-feature-ready. See [[Journal/2026-08-24]].
- **Phase 2–4 release preparation (2026-08-24)**: Clean branches were rebased on merged `main`, preserving the already-merged Phase 6 stock relations: Phase 2 `3e44bd9` ([PR #16](https://github.com/VinceCarter12/Oracle-Inventory/pull/16)), Phase 3 `0d77219` ([PR #17](https://github.com/VinceCarter12/Oracle-Inventory/pull/17)), and Phase 4 `ebce1c7` ([PR #18](https://github.com/VinceCarter12/Oracle-Inventory/pull/18)). Phase 3 now seeds the required infrastructure permissions. Do not apply Phase 2 database migration or enable Belarc proposals until commercial licensing and retention governance are approved; Phase 3 then Phase 4 must merge before Phase 5 is rebased and released.
- **Phase 5 handoff (2026-08-24)**: Claude now owns a fresh Phase 5 implementation. The local `codex/phase5-release` worktree is reference-only and not release-ready. Follow [[Planning/Phase-5-Handoff-and-Release-Plan]] for the conservative security contract and Claude acceptance evidence. Codex resumes only after Claude's PR/report for review, merge, ordered Phase 3/4/5 Supabase migration verification, and disabled production smoke. Phase 6 remains a separate Claude page/test completion lane.
- **Expansion release boundary**: Treat all seven phases as code-complete candidates only. The next release work is clean change isolation, CI-style frontend verification, route-level authorization/concurrency coverage, clean additive migration plus restore proof, browser smoke, then an approved deployment. Phase 2 remains production-disabled until commercial Belarc rights and retention governance are approved.
- **Staging exception (2026-08-24)**: The owner approved bypassing the separate staging environment because the live project has no active users or production inventory data. This is a schedule exception only: it does **not** waive target-project identity confirmation, canonical Supabase migration-history reconciliation, a restorable backup/export, migration preflight, feature-off deployment, production smoke tests, rollback ownership, or the Phase 2 Belarc licensing gate.
- **Belarc**: The code has a working Belarc Advisor HTML workflow. Belarc Advisor is personal/non-commercial; corporate production use is blocked until a supported commercial BelManage/export/API contract and license are confirmed. Source merge was verified on 2026-08-01: upload UI can select safe Belarc fields, blank official Asset fields can accept selected Belarc values, equal values are verified, differing nonblank values become blocking conflicts, existing/minimal Asset records are preferred, scan/update runs transactionally, latest hardware state is recomputed, first baseline remains explicit, and no migration was required.
- **Scan System suspension**: User-facing QR/OCR Scan System work and rollout for `/assets/scan`, `/scan/mobile`, and `/scan/review` are frozen pending a later owner decision. Do not delete the existing code/scaffolds. This suspension does not include Belarc Hardware Audit. See [[Decisions/2026-07-30-suspend-user-facing-scan-rollout]].
- **Frontend hosting**: Vercel with `adapter-vercel` is accepted. Preview deployment for commit `81136f2` is Ready, but Production on `main` failed and `oracle-inventory.vercel.app` reports no deployment. The runtime fix must still be promoted to `main` and production smoke-tested. See [[Planning/Pages/Deployment]].
- **API hosting**: Render Web Service is configured and Live at `https://oracle-inventory-api.onrender.com`; `/health` returned `{ "status": "ok" }` on 2026-07-27. This proves API process availability only, not end-to-end production readiness. See [[Planning/Pages/Deployment]].
- **Database migration**: Supabase project `inventory` is healthy in Tokyo. Supabase migrations `20260729131539_init_oracle_inventory_baseline` and `20260729131623_seed_inventory_roles_permissions` are applied; the schema tables have RLS enabled. Temporary super-admin/admin accounts exist only for initial login and force a password change. See [[Journal/2026-07-29]].
- **Release review**: Production cutover remains blocked by missing restore proof, end-to-end login/RBAC evidence, object/branch authorization, CORS verification, upload/import/email smoke tests, and rollback ownership. See [[Planning/Pages/Deployment]].
- **Department Management**: Code implementation is locally ready and reviewed: dedicated page/sidebar, create/rename/archive/delete, employee reassign/clear resolution, transactional `ActivityLog`, local Prisma migration, and focused tests/build pass. On 2026-08-02, the API runtime's separate Neon database was preflighted (no normalized active-name duplicates) and received the matching `archivedAt` column plus active-name and archive indexes, resolving its Department 500 schema mismatch. The Hardware Audit badge's equivalent database query also succeeded with zero pending mismatches. This is runtime-database verification only: canonical Supabase migration `20260802035140_department_management.sql` remains generated, review-ready, and unapplied for the intended Supabase/company target. See [[Planning/Pages/Departments]] and [[Journal/2026-08-02]].
- **Import system removal**: Bulk upload/import has been intentionally removed from the system. Source cleanup covers frontend routes/navigation/history UI, backend import routes/services, Prisma import models/enums/relations, and a forward-only Supabase removal migration. The current Supabase test DB was not touched; the migration is prepared for the next database account. Actual `Asset` records and `ActivityLog` evidence are preserved. API build and 48 tests passed; frontend check reported 0 errors with existing warnings. See [[Planning/Pages/Import]] and [[Journal/2026-08-02]].
- **Change workflow**: Each feature, fix, vault documentation change, deployment change, migration, or other meaningful change must be its own focused commit and its own pull request. See [[Decisions/2026-07-30-focused-commit-pr-workflow]].
- **Live state**: `oracleinventory.lubesmastery.com` remains the legacy URL. The Render API is live, while the Vercel frontend is Preview-only; do not represent the inventory website as production-live until Vercel Production, API-origin integration, role tests, and security/migration gates pass.

## Current Focus

1. Review and merge the pushed migration-history (`d636a94`), Phase 7 (`799689f`), and Phase 1 (`3de1028`) branches in order before any app deployment; Phases 2–6 still need clean isolation.
2. Run CI-style frontend verification and add route-level branch-authorization, idempotency, and concurrency coverage for the expansion routes.
3. The owner-approved production-only migrations are applied with flags off. Record a backup/export and complete browser/API role smoke tests before enabling Phase 1; staging remains intentionally bypassed and its other safety gates are not waived.
4. Keep all expansion flags disabled by default; keep Phase 2 Belarc production-disabled until commercial rights and retention governance are approved.
5. After the above gates pass, use an approved pilot/release sequence before any production migration or Vercel deployment. Exclude user-facing Scan System rollout while suspended and do not reintroduce bulk import.
6. Implement the approved Department UI/API remediation wireframe and validate it locally without applying the pending Department Supabase migration.
7. Convert the workbook into an approved data dictionary and canonical import contract before expanding the schema, with explicit device, network, and CCTV field ownership.
8. Confirm Belarc acquisition/discovery options: commercial BelManage export/API/connector availability, license terms, contract rights, authentication, limits, and customer-CMDB usage.
9. Resolve owner decisions before production work: global versus branch-scoped admin policy, staging domains, restore RPO/RTO owner, secure bootstrap owner, OTP scope, scheduled-job policy, DNS rollback window, and whether/when to reopen the user-facing Scan System.

## Read Next

| Task | Read |
|---|---|
| Current work and priorities | [[Planning/PLAN]] and [[Planning/Pages/_Overview]] |
| Deployment/hosting | Start with [[Notes/Hosting-Setup-Tutorial]], then [[Planning/Pages/Deployment]] and [[Decisions/2026-07-27-vercel-over-hostinger-deploy]] |
| Device/network/CCTV expansion | [[Planning/Inventory-System-Blueprint]], [[Planning/Inventory-Field-Dictionary]], [[Planning/Pages/Inventory-Intake]], [[Planning/Phase-1-Computer-Intake-Spec]], [[Planning/Phase-3-Network-Infrastructure-Spec]], and [[Planning/Phase-4-CCTV-NVR-Spec]] |
| Belarc proposal hardening | [[Planning/Phase-2-Belarc-Proposal-Hardening-Spec]], [[Planning/Pages/HardwareAudit]], and [[Decisions/2026-08-22-manual-primary-belarc-assisted-intake]] |
| Servers, firewall, ISP, tools, and stock | [[Planning/Phase-5-Servers-Firewall-ISP-Spec]], [[Planning/Phase-6-Tools-and-Stock-Spec]], and [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]] |
| Hardware/Belarc audit | [[Planning/Pages/HardwareAudit]], [[Journal/2026-08-01]], and [[Journal/2026-07-06]] |
| Scan System suspension | [[Decisions/2026-07-30-suspend-user-facing-scan-rollout]] and [[Planning/Pages/ScanSystem]] |
| Import system removal | [[Planning/Pages/Import]] and [[Journal/2026-08-02]] |
| Authentication and permissions | [[Planning/Pages/Auth]], [[Planning/Pages/Roles]], and [[Planning/Pages/Users]] |
| Department Management | [[Planning/Pages/Departments]], [[Planning/Pages/Employees]], and [[Planning/Pages/ActivityLog]] |
| UI/design | [[Design/DESIGN]] and the relevant page spec |
| Vault wiki and knowledge graph | [[Notes/Knowledge-Graph-and-Wiki]] |
| Durable decision rationale | [[Decisions/README]] |
| Dated implementation evidence | newest relevant file under `Journal/` |

## Source-of-Truth Rules

| Information | Canonical location |
|---|---|
| Current reality and read-next routing | `Context.md` |
| File inventory/navigation | `Home.md` Vault Index |
| Detailed task checkboxes | `Planning/Pages/_Overview.md` only |
| High-level remaining work | `Planning/PLAN.md` section 9 |
| Durable decision and rationale | `Decisions/` ADRs |
| Commit and pull request workflow | [[Decisions/2026-07-30-focused-commit-pr-workflow]] |
| Page/feature specification | `Planning/Pages/*.md` without checkboxes |
| Dated implementation/verification evidence | `Journal/YYYY-MM-DD.md` |
| Actual implementation | Current code, schema, tests, git diff/status, and deployment evidence |

When claims conflict, verify against the newest explicit user clarification, accepted ADRs, current code/tests, and production evidence. Never promote planned work to implemented or production-verified.

## Agent Pipeline

Inventory mirrors the Sales App pipeline and its preset model/effort assignments. Codex definitions live in `.codex/agents/`; Claude mirrors live in `.claude/agents/`. The on-demand `enterprise-ux-design-auditor` runs before architecture review for user-facing page, flow, routing, content, visual-system, or accessibility changes; it is read-only and creates a wireframe/redesign only on explicit user request. Stage 6 is adapted from `mobile-engineer` to `inventory-engineer` because this repository is a SvelteKit/Express system.

[[Home]] | [[Planning/PLAN]] | [[Planning/Pages/Deployment]]
