---
date: 2026-06-29
tags: [planning, page-spec]
---

# Assets — Spec

> Routes: `/assets`, `/assets/[id]`, `/assets/add`, `/assets/scan`
> Status: Core done — field additions, tagging, maintenance tracking pending
> Task status tracked in: [[Planning/Pages/_Overview#Assets]]

---

## Field Specs

### Expansion Fields (planned 2026-08-22)

The workbook expansion splits Asset detail into focused sections instead of one large form. The planned source is [[Planning/Pages/Inventory-Intake]], using [[Planning/Inventory-Field-Dictionary]] as the canonical field map.

| Section | Fields |
|---|---|
| Overview | Name, category, serial, property tag, branch, condition, status, ownership, custodian |
| Assignment and lifecycle | Employee assignment, purchase date, warranty expiry, repair/disposal/lost/stolen state |
| Specifications | Computer model, processor, motherboard, RAM components, storage components, OS, monitor/peripheral links |
| Connectivity | MAC/IP/subnet/gateway/DNS, VLAN, SSID observation, switch/NVR port relationships |
| Audit and sources | Manual values, Belarc observations, conflicts, accepted proposals, activity log |
| Maintenance | Repair history, replacement flags, service notes |

Belarc-assisted values are allowed only for reviewed computer hardware fields. Official manual values stay authoritative unless an admin accepts a proposed replacement with reason.

### Standard Fields (pending)
- **Warranty expiry date** — date picker, stored as `warrantyExpiry` (already in schema)
- **Purchase date** — date picker, stored as `purchaseDate`
- **Description / notes** — textarea, free text
- **Photo** — image upload, stored server-side or cloud (decision pending)
- **Asset type code** — short code: `B` = Branch-owned, `L` = Leased (or custom values)
- **BYOD flag** — `ownership` field already in schema (`company` / `personal`); needs clear UI label

### Asset Tagging Format
Auto-generated on creation: `OPC-[branch-code]-[4-digit-sequence]`
- EAN-13 barcode generated from the asset tag
- Print label: barcode + asset name + serial + branch

### CCTV Extra Fields
Only shown when `category = CCTV`:
- Manufacturer, IP address, storage capacity (GB), FPS, night vision (bool), motion detection (bool)

### Categories
- Top-level groups: IT Equipment, Network, CCTV, IP Telephony
- Sub-categories under each group

---

## Maintenance Tracking

- Maintenance record per asset: where sent, repair status, date in/out, notes
- Maintenance history tab on `/assets/[id]`
- Annual refresh flag — mark assets due for replacement by year
- Per-asset activity log on detail page (filters `ActivityLog` by `assetId`)

---

## Known Fixes Applied

- Asset count wrong total — `available` was double-counting assets both assigned AND in repair/disposal; fixed with `none: { status: "active" }` filter in `assets.ts /stats`
- Status not updating to Available after return — same root cause as above; asset list derives status from active assignments which was already correct

---

[[Home]] | [[Planning/Pages/_Overview]]
