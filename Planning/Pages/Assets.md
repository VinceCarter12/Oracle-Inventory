---
date: 2026-06-29
tags: [planning, page-tracker]
---

# Assets — Changes & Features

> Routes: `/assets`, `/assets/[id]`, `/assets/add`, `/assets/scan`
> Status: Core done — field additions, tagging, maintenance tracking pending

---

## Bug Fixes / Changes

- [x] [Easy] Fix asset count showing wrong total on list page — `available` was double-counting assets that were both assigned AND in for_repair/for_disposal condition; now uses a direct Prisma count with `none: { status: "active" }` filter (`assets.ts /stats`)
- [x] [Easy] Fix status not updating to "Available" after a return is approved — same root cause as above (stat calc); asset list derives status from active assignments which was already correct

---

## New Features

### Asset Fields
- [ ] [Medium] Add warranty expiry date field to asset form + detail view
- [ ] [Medium] Add purchase date field to asset form + detail view
- [ ] [Easy] Add description / notes text area to asset form
- [ ] [Hard] Add photo upload field (image stored in server or cloud storage)
- [ ] [Easy] Add asset type code field (B = Branch-owned, L = Leased — or custom)
- [ ] [Medium] BYOD distinction — Company vs Personal ownership flag (already in schema as `ownership`, wire to UI clearly)

### Asset Tagging & Barcodes
- [ ] [Hard] Auto-generate asset tags in format `OPC-[branch code]-[4-digit number]` on asset creation
- [ ] [Hard] Generate EAN-13 barcode from asset tag
- [ ] [Hard] Print-ready label layout (barcode + asset name + serial + branch)
- [ ] [Easy] "Inspect" quick-view button on asset list row — opens detail panel without full navigation

### Maintenance Tracking
- [ ] [Hard] Maintenance record per asset — where sent, repair status, date in/out, notes
- [ ] [Medium] Maintenance history tab on `/assets/[id]` detail page
- [ ] [Medium] Annual refresh support — flag assets due for replacement by year
- [ ] [Medium] Per-asset activity log section on detail page (filter ActivityLog by assetId)

### CCTV Extra Fields
- [ ] [Hard] Extra fields for CCTV category: manufacturer, IP address, storage capacity, FPS, night vision (bool), motion detection (bool)
- [ ] [Medium] Show CCTV-specific fields only when category = CCTV

### Categories
- [ ] [Medium] Top-level category groups: IT Equipment, Network, CCTV, IP Telephony
- [ ] [Easy] Sub-category support under top-level groups
