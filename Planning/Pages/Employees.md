---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Employees — Changes & Features

> Routes: `/employees`, `/employees/[id]`
> Status: Core done — bugs in bulk import detection + profile enhancements pending

---

## Bug Fixes / Changes

- [x] [Medium] Fix: bulk upload employee first name not being detected correctly — added `startsWith` OR clause alongside exact-match so a single-token ref like "Juan" now matches "Juan Santos" in the DB (`import.ts` line ~737)
- [x] [Easy] Fix: branch filter missing "Cubao" branch — two fixes: (1) `lookup.ts` now filters `archivedAt: null`; (2) `seed.ts` now seeds Cubao, Malolos, Davao branches on fresh installs. **Note**: for existing DBs, create the Cubao branch manually via the Branches page if it doesn't exist.
- [x] [Easy] Fix: employee count showing incorrect total — root cause was same double-counting in asset stats; employee counts derive from loaded data which is accurate

---

## New Features

- [ ] [Easy] Email field visible and editable on employee profile (already in schema, confirm it's wired to UI)
- [ ] [Medium] Full device assignment history tab on employee detail page
- [ ] [Medium] Maintenance history tab on employee detail page (assets they had that went for repair)
- [x] [Hard] Exit check workflow — on employee offboarding, block returns until hardware scans confirm device state ✅ 2026-07-06 (Hardware Audit Phase E): resignation/turnover collection is refused (with `blockedAssets` listed) if any selected asset is audit-enrolled and its latest scan isn't reviewed yet. Note: this *blocks* uncleared returns rather than *triggering* a scan request — no notification is sent asking the employee to run one
- [ ] [Easy] Employee status badge (Active / Inactive) clearly shown on list and profile
