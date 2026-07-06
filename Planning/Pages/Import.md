---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Import — Changes & Features

> Routes: `/assets/import`, `/assets/import/history`, `/assets/import/history/[id]`
> Status: Core done — UX improvements + bug fixes pending

---

## Bug Fixes / Changes

- [x] [Easy] Fix: import preview showing empty rows when required column (name) not mapped — `validateRows` now always runs so `mappedData` is populated; mapping errors are injected per-row on top (`import.ts` parse endpoint)
- [x] [Medium] Fix: employee first name not detected during bulk upload — added `startsWith` OR clause so single-token refs like "Juan" match "Juan Santos" in DB (`import.ts` ~line 737)
- [ ] [Easy] Fix: import error messages not specific enough — show which column/row failed and why

---

## New Features

- [ ] [Easy] Drag-and-drop file upload zone (if not already implemented)
- [ ] [Medium] Pre-import preview table — show all rows before confirming import
- [ ] [Medium] Per-row status indicators in preview: Duplicate / Skipped / Will Import / Error
- [ ] [Medium] Skip individual rows before import — checkbox per row to exclude
- [ ] [Hard] Edit individual rows in preview before import — inline editing in preview table
- [ ] [Easy] Import progress indicator — show % complete during large imports
- [ ] [Medium] Re-run failed rows — on import history detail, retry only the failed rows
