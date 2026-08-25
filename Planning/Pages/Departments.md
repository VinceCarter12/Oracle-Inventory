---
date: 2026-08-02
tags: [planning, page-spec]
---

# Departments - Spec

> Route: `/departments`
> Status: Locally implemented and reviewed; UI/API remediation wireframe approved; Supabase migration is apply-ready but not applied
> Task status tracked in: [[Planning/Pages/_Overview#Departments]]

---

## Current State

- Dedicated Department Management page exists and is linked from the sidebar.
- Department create, rename, archive, and delete flows are implemented.
- Delete/archive resolution supports reassigning affected employees to another department or clearing their department assignment.
- Department changes write transactional `ActivityLog` records.
- Local Prisma migration and focused API tests/build passed.
- A Department UI remediation wireframe is owner-approved for implementation. This is a page/API polish batch only and does not apply the canonical Supabase migration.

## Approved UI/API Remediation Scope

- Preserve the existing Department lifecycle model: active departments are the default working set, archived departments are recoverable, and delete/archive actions must force explicit employee relationship resolution.
- Improve the user-facing Department page around scanability, empty/loading/error states, destructive-action clarity, validation copy, and membership impact before archive/delete.
- Align API/UI behavior for Department validation and employee-resolution failures so the page shows actionable messages instead of ambiguous failure states.
- Keep Super Admin/admin authorization, employee reassignment/clear behavior, and transactional `ActivityLog` requirements intact.
- Treat this remediation as separate from the unapplied canonical Supabase migration. It may be code-ready locally, but it must not be described as database-applied, deployment-verified, or released until the migration and release gates below pass.

## Release Blocker

- Canonical Supabase migration `20260802035140_department_management.sql` is generated and review-ready.
- Before applying it, verify there are no active duplicate department names after trim/case normalization and no conflicting existing index with the same name.
- Do not mark Department Management production-ready until the migration is applied and verified against the target database.

## Validation and Release Gates

- UI/API remediation must pass focused Department API tests, relevant frontend checks, and a browser smoke test for create, rename, archive, unarchive, delete with reassign, and delete with clear.
- Migration release remains gated separately: target-database preflight, explicit owner approval to apply, application to the intended Supabase project, post-apply schema/data verification, and rollback notes.
- Production release requires staging login/RBAC evidence, Department page smoke evidence on the deployed frontend/API pair, CORS/API-origin verification, and confirmation that bulk import remains removed.

---

[[Home]] | [[Planning/Pages/_Overview]] | [[Planning/Pages/Employees]] | [[Planning/Pages/ActivityLog]]
