---
date: 2026-06-29
tags: [planning, page-spec]
---

# Employees — Spec

> Routes: `/employees`, `/employees/[id]`
> Status: Core done — profile enhancements pending
> Task status tracked in: [[Planning/Pages/_Overview#Employees]]

---

## Business Rules

- **Manual intake owns employee truth** - Employee name, employee number, email, site/branch, department, position, and assignment context come from [[Planning/Pages/Inventory-Intake]], not Belarc. Belarc may show local user observations as evidence but must not update official employee identity.

- **Assignment display for expanded inventory** - Employee detail should group assigned devices by company-owned, BYOD, peripherals, and infrastructure responsibility. Counts shown on the profile are computed from assignments, not manually typed workbook counts. See [[Planning/Inventory-Field-Dictionary]].

- **Department deletion/archive resolution** - Department Management can reassign affected employees to another department or clear their department assignment before completing the department operation. Release remains blocked until the Supabase migration is applied and verified. See [[Planning/Pages/Departments]].

- **Exit check on offboarding** — resignation/turnover collection is refused (with `blockedAssets` listed) if any assigned asset is audit-enrolled and its latest scan isn't reviewed yet. Blocks the return, does not trigger a scan request automatically. See [[Planning/Pages/HardwareAudit]].

## Known Fixes Applied

- Bulk upload first name not detected — added `startsWith` OR clause so single-token refs like "Juan" match "Juan Santos" in DB (`import.ts` ~line 737)
- Branch filter missing Cubao — `lookup.ts` now filters `archivedAt: null`; `seed.ts` seeds Cubao, Malolos, Davao on fresh installs. Existing DBs: create Cubao manually via Branches page.
- Employee count wrong — was using same double-counting logic as asset stats; derives from loaded data which is accurate

---

[[Home]] | [[Planning/Pages/_Overview]]
