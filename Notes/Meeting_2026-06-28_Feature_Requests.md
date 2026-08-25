---
date: 2026-06-28
tags: [note, meeting, features]
---

# Feature Requests — Demo Review Meeting (2026-06-28)

> Extracted from the 1-hour demo/review session. Grouped by area.
> Source: [[Notes/Meeting_2026-06-28_Transcribe_Full]]
> Requested by: Sir Jay, Sir Raham, Sir Allen (and the dev during demo)

---

## Dashboard

- [ ] Show summary counters: **Total Assets**, **Assigned**, **Under Repair**, **Disposal**
- [ ] Break down assets by **category** on dashboard (Laptop, Desktop, Company Phone — not just total)
- [ ] Option to further separate by **brand**
- [ ] Show **assignment history** on dashboard
- [ ] Combined the report page and dashboard. NO more report page ( the ui that will be use is report page )

---

## Assets

### Fields
- [ ] Asset name, branch, category, type code (B = Desktop, L = Laptop)
- [ ] Serial number *(optional)*
- [ ] Office tag *(optional, alongside serial)*
- [ ] Status: **Usable / For Replacement / Disposal** — add "Replace" as explicit status *(Sir Raham)*
- [ ] Company vs Personal flag *(for BYOD monitoring)*
- [ ] Warranty expiry — with **email notification** when expiring
- [ ] Purchase date *(optional)*
- [ ] Description *(optional)*
- [ ] Asset photo upload

### Status Behavior
- [ ] Broken assets can remain **active in records** before disposal (don't auto-archive)
- [ ] Disposal marks asset but keeps history
### Maintenance Tracking *(Sir Raham + Sir Allen)*
- [ ] Track where asset is sent for repair
- [ ] Track repair status (in progress / fixed / disposed)
- [ ] Show **maintenance history** per asset (how many times, dates)
- [ ] Annual refresh/audit cycle support

### Activity Log (per asset)
- [ ] Show recent activity on the asset detail page (assigned, returned, repaired, etc.)

---

## Asset Tagging & Barcodes

- [ ] Auto-generate **asset tag** on creation: format `OPC-[branch code]-[4-digit number]`
  - `OPC-01-XXXX` = Cubao
  - `OPC-02-XXXX` = Malolos
- [ ] Tag auto-updates when asset is changed
- [ ] Barcode standard: **EAN-13** (European Article Number) — free to use
- [ ] **Print-ready** barcode label from asset detail page
- [ ] Inspect button on asset list to quick-view asset details

---

## Asset Categories

- [ ] Separate top-level category groups: **IT Equipment**, **Network**, **CCTV**, **IP Telephony**
- [ ] BYOD distinction within IT Equipment: Company Laptop vs Personal Laptop, Company Phone vs Personal Phone
- [ ] Filter assets by: category, status (available / spare / disposal), brand, department

### CCTV Category — Extra Fields
- [ ] Manufacturer, model, serial number, firmware version
- [ ] IP address, physical location
- [ ] Storage capacity, number of connected cameras
- [ ] Resolution, night vision (Y/N), motion detection (Y/N)
- [ ] Recording FPS (standard: 30fps)

### Network Equipment Category
- [ ] Switches, Access Points — minimum: serial number, location
- [ ] KBX / IP Phones / IP Telephony — fields TBD

---

## Bulk Import (Excel / CSV)

- [ ] **Drag-and-drop** Excel file upload
- [ ] Support **multiple uploads** (not just one-time); handle conflicts gracefully
- [ ] **Pre-import preview**: show detected data before committing
- [ ] Auto-detect **categories and departments** from Excel column values
- [ ] Per-row status: `duplicate` / `skipped` / `overwritten` / `error`
- [ ] Allow **skip or edit** individual rows during review before import
- [ ] Auto-assign employees to assets if both are in the same file
- [ ] Show validation errors before the mapping step

---

## Assignment Flow

- [ ] **One person per asset** (default rule) — shared assets assigned to nearest/responsible person
- [ ] Assignment date defaults to today, but **editable**
- [ ] Search employee **by name** (fix: first name detection not working)
- [ ] **Branch filter** on employee search during assignment
- [ ] Confirm assignment button
- [ ] After return: asset status changes to **Available** immediately
- [ ] Assignment and return history visible on both asset and employee profiles

---

## Employee Profile

- [ ] Full **device assignment history** (all past and current devices)
- [ ] **Maintenance history** for assets linked to this employee
- [ ] Email field (Zoho mail)
- [ ] **Exit check**: run hardware scan / checklist before employee off-boards

---

## Belarc Hardware Audit Integration *(→ PLANNED — see [[Planning/Pages/HardwareAudit]])*

> Dev showed a freeware tool (likely Belarc Advisor) that auto-reads PC specs.
> **Status**: Confirmed feature — full plan, wireframes, and implementation phases in [[Planning/Pages/HardwareAudit]].

- [x] Pull hardware specs automatically: OS, RAM (slots + used), CPU, GPU, storage (HDD/SSD + serial), motherboard, network connections, antivirus
- [x] **Compare stored specs vs live scan** — flag discrepancies (e.g. RAM removed, drive swapped)
- [x] Export from Belarc as HTML single file → employee uploads to system
- [x] Use as part of **employee exit check** *(Phase E — deferred)*
- [x] Green/yellow/red spec match status per field on comparison detail page

---

## Branch Map

- [ ] Map view showing **geographic locations of branches** (cubao, Malolo)
- [ ] Clickable branch → view assets and employees at that branch

---

## Roles & Permissions

- [ ] Roles: **SuperAdmin, Admin, Staff, Viewer, Scanner**
- [ ] **No duplicate SuperAdmin** — only one allowed
- [ ] Role-based permission toggles (e.g. remove "View Reports" from a role)
- [ ] Permissions apply per user based on assigned role

---

## Activity Logs

- [ ] Log **all activities** from all users and roles
- [ ] Logs are **never deleted** — append only
- [ ] Archive old logs (compress, not delete)
- [ ] Filter logs by user, role, action type

---

## Bugs Noted During Demo

| Bug                                   | Detail                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Bulk upload — employee name detection | First name search not working, inconsistent matching                    |
| Assignment status after return        | Status not updating to "Available" correctly                            |
| Branch filter                         | "Kobao" missing from dropdown in some views                             |
| Branch summary counts                 | Asset/employee counts showing wrong totals (13/13/13) — file data issue |
| Import mapping                        | Missing fields not displayed during preview step                        |

-----------------------

## Department 



