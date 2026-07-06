---
date: 2026-07-03
tags: [planning, feature]
---

# Hardware Audit — Feature Plan & Wireframes

> **Source**: Sir Jay's request from [[Notes/Meeting_2026-06-28_Feature_Requests]] — Belarc Hardware Audit Integration
> **Status**: Planning — not started
> **Related**: [[Planning/Pages/Assets]], [[Planning/Pages/Employees]]

---

## Overview

Employee runs **Belarc Advisor** on their PC → exports an HTML report → uploads it to Oracle Inventory → Admin reviews a **side-by-side comparison** of stored baseline specs vs. live scan results → discrepancies are flagged green / yellow / red.

---

## User Flow

```
[Employee PC]
     │
     │  1. Runs Belarc Advisor → saves HTML report
     ▼
[Oracle Inventory — Employee or Admin]
     │
     │  2. Uploads Belarc HTML at /hardware-audit/upload
     │     Selects which Asset this scan belongs to
     ▼
[System — Backend]
     │
     │  3. Parses Belarc HTML → extracts specs JSON
     │  4. Loads stored Baseline Specs for that Asset
     │  5. Compares field-by-field → computes match status per field
     ▼
[Admin — /hardware-audit]
     │
     │  6. Sees pending scan in queue
     ▼
[Admin — /hardware-audit/[scanId]]
     │
     │  7. Reviews comparison: Baseline vs. Live, row by row
     │  8. Marks as Reviewed / Flags for action
```

---

## Data Model Additions

> **DECISION (2026-07-03)**: No manual baseline entry. The **first accepted scan IS the baseline** —
> admin uploads the first Belarc HTML and clicks "Accept as baseline". All later scans compare
> parsed JSON vs. the baseline scan's parsed JSON. The `AssetHardwareSpec` model is **dropped**;
> replaced by a `baselineScanId` pointer on Asset (or a `isBaseline` flag on `HardwareScan`).

### `HardwareScan` (submitted scan — doubles as baseline)

| Field | Type | Notes |
|-------|------|-------|
| `id` | String | PK |
| `assetId` | String | FK → Asset |
| `submittedBy` | String | FK → SystemUser (who uploaded) |
| `rawHtml` | Text | full Belarc HTML file content — kept as evidence, viewable from comparison page |
| `parsedSpecs` | JSON | extracted sections (see Recorded Sections below) |
| `isBaseline` | Boolean | true = this scan is the asset's baseline; only one per asset |
| `comparisonResult` | JSON | field-by-field diff vs. baseline scan (null if this IS the baseline) |
| `overallStatus` | Enum | `match / warning / mismatch` |
| `status` | Enum | `pending / reviewed / flagged / archived` |
| `reviewedBy` | String? | FK → SystemUser |
| `reviewedAt` | DateTime? | |
| `reviewNotes` | String? | admin notes |
| `createdAt` | DateTime | |

### `ComparisonStatus` Enum
`match` | `warning` | `mismatch` | `missing`

---

## Pages

### 1. `/assets/[id]` — Hardware Specs Tab *(add tab to existing page)*
### 2. `/hardware-audit/upload` — Submit a Scan
### 3. `/hardware-audit` — Admin Scan Queue
### 4. `/hardware-audit/[scanId]` — Comparison Detail

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/hardware-audit/scan` | Upload Belarc HTML — parse; compare if baseline exists |
| GET | `/api/hardware-audit/scans` | List all scans (paginated, filterable) |
| GET | `/api/hardware-audit/scans/:scanId` | Get scan + comparison detail |
| GET | `/api/hardware-audit/scans/:scanId/raw` | Serve original Belarc HTML (evidence view) |
| PUT | `/api/hardware-audit/scans/:scanId/baseline` | Accept this scan as the asset's baseline |
| PUT | `/api/hardware-audit/scans/:scanId/review` | Mark reviewed / flag / archive |
| GET | `/api/hardware-audit/baseline/:assetId` | Get current baseline scan for an asset |

---

## Belarc HTML Parsing Strategy

> **Verified 2026-07-03 against a real export** (`(Carter).html`, Belarc Advisor on ASUS ROG Strix G513IC).
> Belarc saves reports to `C:\Program Files (x86)\Belarc\BelarcAdvisor\System\tmp\(ComputerName).html` (~130 KB, self-contained).

**HTML structure (confirmed):** every section is a `<div class="reportSection">` containing a
`<div class="reportSectionHeader">` (section title + inline summary) and a `<div class="reportSectionBody">` (detail rows).
Parser selects on these class names — stable and simple.

### Recorded Sections — "Computer Profile Summary"

| # | Belarc Section | Example (from real scan) | Volatile? |
|---|----------------|--------------------------|-----------|
| 1 | Operating System | Windows 11 Home SL (x64) 25H2 build 26200 | version = warning-level |
| 2 | System Model | ASUSTeK ROG Strix G513IC + system serial | **no — hard compare** |
| 3 | Processor | AMD Ryzen 7 4800H 2.90 GHz | **no — hard compare** |
| 4 | Main Circuit Board | ASUS G513IC 1.0 + board serial | **no — hard compare** |
| 5 | Local Storage | 985.25 GB usable capacity | free space = SKIP |
| 6 | Memory | 31.42 GB, per-slot with serials (DIMM 0: 16GB) | **no — hard compare** |
| 7 | Local Storage Volumes | c: NTFS 487.03 GB, BitLocker status | free space = SKIP |
| 8 | Network Storage Volumes | None detected | — |
| 9 | Users | local accounts + last login | last-login = SKIP |
| 10 | Printers | Microsoft IPP / Print to PDF | soft compare |
| 11 | Display | Radeon Graphics + RTX 3050 Laptop GPU | **no — hard compare** |
| 12 | Multimedia | AMD/NVIDIA HD Audio | soft compare |
| 13 | Controllers | None detected | soft compare |
| 14 | Bus Adapters | MS Storage Spaces, VHD Loopback | soft compare |
| 15 | Virus Protection | Windows Defender 4.18.26050.15 | version = expected drift |
| 16 | Group Policies | None detected | soft compare |
| 17 | Communications | Bluetooth PAN, adapters + MACs | MACs = hard compare |
| 18 | Other Devices | Headset, USB audio, etc. | soft compare |
| 19 | Hosted Virtual Machines | None detected | soft compare |
| 20 | Network Map | IP / device type / physical address | IPs = SKIP (DHCP churn) |
| 21 | Software Licenses | ASUS Config, license keys | **no — hard compare** |

*(Also present in export but NOT recorded: Missing Security Updates, Software Versions & Usage,
Installed Hotfixes, USB Storage Use — too volatile, would flood comparisons with noise.)*

Parser runs **server-side in Node.js** using `cheerio` or `node-html-parser`, selecting
`.reportSection` → header text = section name, body = detail rows. No Belarc API — pure HTML scraping.

### Volatility Tiers (drives comparison behavior)

| Tier | Fields | On difference |
|------|--------|---------------|
| **Hard** | System/board/RAM/drive serials, CPU, GPU, RAM size, model | 🔴 `mismatch` |
| **Soft** | OS version, AV version, peripherals, printers | 🟡 `warning` |
| **Skip** | Free disk space, last logins, DHCP IPs, hotfixes, software usage | ignored — never flagged |

---

## Comparison Logic

For each field:

| Condition | Status | Badge |
|-----------|--------|-------|
| Exact match | `match` | 🟢 Green |
| Partial match (e.g. OS version differs, same OS) | `warning` | 🟡 Yellow |
| No match (e.g. RAM total different, drive serial changed) | `mismatch` | 🔴 Red |
| Field exists in baseline but missing in scan | `missing` | ⚫ Grey |

Overall status = worst status across all fields.

---

---

# WIREFRAMES

> All wireframes use the Oracle Inventory design system (Vercel-inspired, sidebar layout).
> Sidebar is always present on dashboard routes. See [[Design/DESIGN]].

---

## Page 1 — Asset Detail: Hardware Specs Tab
**Route**: `/assets/[id]` → "Hardware" tab

> ⚠ **2026-07-03 update**: the "Edit Specs" modal below is **obsolete** — no manual entry.
> The specs card now renders the **baseline scan's parsed data** (read-only), with a
> "View Original Belarc Report" link and a "Replace Baseline" action (upload new scan → accept).

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR   │                                                             │
│            │  ← Back to Assets                                          │
│  Dashboard │                                                             │
│  Assets  ● │  HP EliteBook 840 G9                    [Edit] [More ▾]    │
│  Employees │  SN: 5CD234WXYZ · Cubao Branch · Active                    │
│  ...       │                                                             │
│            │  ┌──────────────────────────────────────────────────────┐  │
│            │  │  Overview   Assignments   Maintenance   Hardware ←   │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │  ┌─────────────────────────────────────────────────┐       │
│            │  │  Baseline Hardware Specs              [Edit Specs]│      │
│            │  │  Last updated: Jun 28, 2026 by Sir Jay           │      │
│            │  ├─────────────────────────────────────────────────┤       │
│            │  │                                                   │      │
│            │  │  OS            Windows 11 Pro 23H2               │      │
│            │  │  CPU           Intel Core i5-12400 @ 2.50GHz     │      │
│            │  │  RAM           16 GB  (2 slots: 2×8GB DDR4-3200) │      │
│            │  │  GPU           Intel UHD Graphics 730            │      │
│            │  │  Motherboard   ASUS PRIME B660M-A D4             │      │
│            │  │                                                   │      │
│            │  │  Storage                                          │      │
│            │  │  ├─ C:  SSD 512 GB  · S/N: S3EVNX0N123456       │      │
│            │  │  └─ D:  HDD 1 TB   · S/N: WD-WX31EA7K1234       │      │
│            │  │                                                   │      │
│            │  │  Network                                          │      │
│            │  │  ├─ Ethernet  · MAC: A8:5E:45:12:34:56           │      │
│            │  │  └─ Wi-Fi     · MAC: D0:AB:D5:78:90:AB           │      │
│            │  │                                                   │      │
│            │  │  Antivirus     Windows Defender — updated Jun 28  │      │
│            │  │                                                   │      │
│            │  └─────────────────────────────────────────────────┘       │
│            │                                                             │
│            │  ┌─────────────────────────────────────────────────┐       │
│            │  │  Scan History                    [Upload New Scan]│      │
│            │  ├─────────────────────────────────────────────────┤       │
│            │  │  Date           Submitted By    Status           │      │
│            │  │  Jul 03, 2026   Maria Santos    🔴 2 mismatches  │      │
│            │  │  Jun 01, 2026   Sir Jay         🟢 Match         │      │
│            │  │  May 15, 2026   Sir Jay         🟡 1 warning     │      │
│            │  └─────────────────────────────────────────────────┘       │
│            │                                                             │
└─────────────────────────────────────────────────────────────────────────┘

  EDIT SPECS MODAL (opens when [Edit Specs] clicked)
  ┌─────────────────────────────────────────────────────┐
  │  Edit Baseline Specs — HP EliteBook 840 G9      [✕] │
  ├─────────────────────────────────────────────────────┤
  │  OR  [Import from Belarc HTML ↑]  ← auto-fills form │
  │  ─────────────────────────────────────────────────  │
  │  OS            [Windows 11 Pro 23H2            ]    │
  │  CPU           [Intel Core i5-12400 @ 2.50GHz  ]    │
  │  RAM Total     [16 GB                          ]    │
  │  GPU           [Intel UHD Graphics 730         ]    │
  │  Motherboard   [ASUS PRIME B660M-A D4          ]    │
  │  Antivirus     [Windows Defender               ]    │
  │                                                     │
  │  Storage Drives                          [+ Add]    │
  │  ┌─────────────────────────────────────────────┐   │
  │  │ Label [C: ] Type [SSD▾] Size [512 GB]       │   │
  │  │ Serial [S3EVNX0N123456               ]   [✕]│   │
  │  ├─────────────────────────────────────────────┤   │
  │  │ Label [D: ] Type [HDD▾] Size [1 TB  ]       │   │
  │  │ Serial [WD-WX31EA7K1234              ]   [✕]│   │
  │  └─────────────────────────────────────────────┘   │
  │                                                     │
  │                     [Cancel]  [Save Baseline]       │
  └─────────────────────────────────────────────────────┘
```

**Notes:**
- "Hardware" tab only appears when asset category is IT Equipment (Laptop, Desktop, PC)
- "Import from Belarc HTML" inside the modal auto-fills all fields by parsing the uploaded file — no comparison, just baseline setup
- Scan history table rows link to `/hardware-audit/[scanId]`

---

## Page 2 — Upload Scan
**Route**: `/hardware-audit/upload`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR   │                                                             │
│            │  Hardware Audit                                             │
│  Dashboard │  Upload a New Scan                                          │
│  Assets    │                                                             │
│  Employees │  ─────────────────────────────────────────────────────     │
│  Hardware● │                                                             │
│  Audit     │  Step 1 — Select Asset                                      │
│  ...       │  ┌──────────────────────────────────────────────────────┐  │
│            │  │  Which asset does this scan belong to?               │  │
│            │  │                                                      │  │
│            │  │  [🔍 Search asset by name or serial number...     ]  │  │
│            │  │                                                      │  │
│            │  │  ┌───────────────────────────────────────────────┐  │  │
│            │  │  │ HP EliteBook 840 G9  · SN: 5CD234WXYZ         │  │  │
│            │  │  │ Cubao Branch · Assigned to: Maria Santos   [✓] │  │  │
│            │  │  └───────────────────────────────────────────────┘  │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │  Step 2 — Upload Belarc HTML File                          │
│            │  ┌──────────────────────────────────────────────────────┐  │
│            │  │                                                      │  │
│            │  │          ┌────────────────────────────┐             │  │
│            │  │          │                            │             │  │
│            │  │          │   ↑  Drop Belarc HTML      │             │  │
│            │  │          │      file here             │             │  │
│            │  │          │                            │             │  │
│            │  │          │   or [Browse file...]      │             │  │
│            │  │          └────────────────────────────┘             │  │
│            │  │                                                      │  │
│            │  │  Accepted: .html, .htm — Belarc Advisor export only  │  │
│            │  │                                                      │  │
│            │  │  ✅ belarc_report_maria_jul03.html (148 KB)          │  │
│            │  │     Parsed successfully — 6 sections detected        │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │  Step 3 — Preview Parsed Specs                             │
│            │  ┌──────────────────────────────────────────────────────┐  │
│            │  │  OS            Windows 11 Pro 23H2                   │  │
│            │  │  CPU           Intel Core i5-12400 @ 2.50GHz         │  │
│            │  │  RAM           16 GB (2 × 8GB DDR4)                  │  │
│            │  │  GPU           Intel UHD Graphics 730                │  │
│            │  │  Drives        C: SSD 512GB · D: HDD 1TB             │  │
│            │  │  Antivirus     Windows Defender — updated Jul 03     │  │
│            │  │                                                      │  │
│            │  │  ⚠ Some sections could not be detected:             │  │
│            │  │     Motherboard — not found in this export           │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │                         [Cancel]  [Submit for Review →]    │
│            │                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- Asset selector uses the existing lookup API (`/api/lookup/assets`)
- Parse happens immediately on file drop (client sends file to `POST /api/hardware-audit/scan` with `dryRun: true` first)
- Preview step shows what was extracted so employee can verify before submitting
- "Submit for Review" finalizes the scan and notifies admin

---

## Page 3 — Admin Scan Queue
**Route**: `/hardware-audit`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR   │                                                             │
│            │  Hardware Audit                          [Upload Scan +]    │
│  Dashboard │  Review submitted Belarc scans                              │
│  Assets    │                                                             │
│  Employees │  ┌─── Filters ──────────────────────────────────────────┐  │
│  Hardware● │  │ Status [All ▾]  Branch [All ▾]  Date [Last 30d ▾]   │  │
│  Audit     │  └──────────────────────────────────────────────────────┘  │
│  ...       │                                                             │
│            │  ┌── Summary Chips ─────────────────────────────────────┐  │
│            │  │  🔴 3 Mismatches   🟡 2 Warnings   🟢 12 Clean       │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │  ┌──────────────────────────────────────────────────────┐  │
│            │  │  Asset              Submitted     By           Status │  │
│            │  ├──────────────────────────────────────────────────────┤  │
│            │  │  HP EliteBook 840   Jul 03 2026   Maria Santos        │  │
│            │  │  SN: 5CD234WXYZ     10:32 AM      Cubao         🔴    │  │
│            │  │  2 mismatches · RAM removed, drive serial changed     │  │
│            │  ├──────────────────────────────────────────────────────┤  │
│            │  │  Dell Latitude 5430 Jul 02 2026   John Reyes          │  │
│            │  │  SN: 4BXKL91        09:15 AM      Malolos       🟡    │  │
│            │  │  1 warning · OS version updated                       │  │
│            │  ├──────────────────────────────────────────────────────┤  │
│            │  │  Lenovo ThinkPad    Jun 30 2026   Sir Jay             │  │
│            │  │  SN: PF3KQT02       03:44 PM      Cubao         🟢    │  │
│            │  │  All specs match                              REVIEWED │  │
│            │  ├──────────────────────────────────────────────────────┤  │
│            │  │  Acer Aspire 5      Jun 28 2026   Admin               │  │
│            │  │  SN: NX.K3QSP.001   11:00 AM      Davao         🔴    │  │
│            │  │  3 mismatches · GPU missing, 2 drives unrecognized    │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │  Showing 4 of 17 scans  [← Prev]  Page 1 of 5  [Next →]   │
│            │                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- Rows are sorted: Pending mismatches first, then warnings, then clean reviewed
- Clicking any row goes to `/hardware-audit/[scanId]`
- "Reviewed" badge mutes the row visually (lower contrast)
- Status chip in top-right of each row: 🔴 mismatch / 🟡 warning / 🟢 match + "PENDING" or "REVIEWED" label
- Sidebar nav item "Hardware Audit" shows a red dot badge if there are pending mismatches

---

## Page 4 — Comparison Detail
**Route**: `/hardware-audit/[scanId]`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR   │                                                             │
│            │  ← Back to Hardware Audit Queue                            │
│  Dashboard │                                                             │
│  Assets    │  HP EliteBook 840 G9  · SN: 5CD234WXYZ                     │
│  Employees │  Scan submitted Jul 03, 2026 · 10:32 AM by Maria Santos    │
│  Hardware● │  Cubao Branch                                               │
│  Audit     │                                                             │
│            │  ┌── Overall Result ────────────────────────────────────┐  │
│            │  │                                                      │  │
│            │  │   🔴 MISMATCH — 2 discrepancies found                │  │
│            │  │                                                      │  │
│            │  │   RAM removed (8 GB missing)                         │  │
│            │  │   Drive serial number changed (C: drive)             │  │
│            │  │                                                      │  │
│            │  └──────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │  ┌── Spec Comparison ────────────────────────────────────┐ │
│            │  │                                                       │ │
│            │  │  Field          Baseline (Stored)   Live Scan         │ │
│            │  │  ─────────────────────────────────────────────────── │ │
│            │  │                                                       │ │
│            │  │  OS             Windows 11 Pro       Windows 11 Pro   │ │
│            │  │                 23H2                 23H2          🟢  │ │
│            │  │                                                       │ │
│            │  │  CPU            Intel i5-12400       Intel i5-12400   │ │
│            │  │                 @ 2.50 GHz           @ 2.50 GHz    🟢  │ │
│            │  │                                                       │ │
│            │  │  RAM            16 GB                8 GB         🔴  │ │
│            │  │  ┌────────────────────────────────────────────────┐  │ │
│            │  │  │ ⚠ Baseline expects 16 GB (2×8GB DDR4-3200).   │  │ │
│            │  │  │   Live scan shows only 8 GB (1×8GB).           │  │ │
│            │  │  │   One RAM stick may have been removed.          │  │ │
│            │  │  └────────────────────────────────────────────────┘  │ │
│            │  │                                                       │ │
│            │  │  GPU            Intel UHD 730        Intel UHD 730   │ │
│            │  │                                                    🟢  │ │
│            │  │                                                       │ │
│            │  │  Motherboard    ASUS PRIME B660M-A   ASUS PRIME      │ │
│            │  │                                      B660M-A       🟢  │ │
│            │  │                                                       │ │
│            │  │  ─── Storage ─────────────────────────────────────── │ │
│            │  │                                                       │ │
│            │  │  C: Drive       SSD 512 GB           SSD 512 GB      │ │
│            │  │  Serial         S3EVNX0N123456       S3EVNX0N999999 🔴│ │
│            │  │  ┌────────────────────────────────────────────────┐  │ │
│            │  │  │ ⚠ Serial number does not match baseline.       │  │ │
│            │  │  │   Original: S3EVNX0N123456                     │  │ │
│            │  │  │   Detected: S3EVNX0N999999                     │  │ │
│            │  │  │   Drive may have been swapped.                  │  │ │
│            │  │  └────────────────────────────────────────────────┘  │ │
│            │  │                                                       │ │
│            │  │  D: Drive       HDD 1 TB             HDD 1 TB        │ │
│            │  │  Serial         WD-WX31EA7K1234      WD-WX31EA7K1234 │ │
│            │  │                                                    🟢  │ │
│            │  │                                                       │ │
│            │  │  ─── Network ─────────────────────────────────────── │ │
│            │  │                                                       │ │
│            │  │  Ethernet MAC   A8:5E:45:12:34:56   A8:5E:45:12:34:56│ │
│            │  │                                                    🟢  │ │
│            │  │                                                       │ │
│            │  │  ─── Security ──────────────────────────────────── ─ │ │
│            │  │                                                       │ │
│            │  │  Antivirus      Windows Defender     Windows Defender │ │
│            │  │                 updated Jun 28       updated Jul 03 🟡│ │
│            │  │  ┌────────────────────────────────────────────────┐  │ │
│            │  │  │ ℹ Antivirus updated since baseline was set.    │  │ │
│            │  │  │   This is expected — baseline date was Jun 28.  │  │ │
│            │  │  └────────────────────────────────────────────────┘  │ │
│            │  │                                                       │ │
│            │  └───────────────────────────────────────────────────────┘ │
│            │                                                             │
│            │  ┌── Admin Review ───────────────────────────────────────┐ │
│            │  │  Notes  [                                          ]   │ │
│            │  │         [                                          ]   │ │
│            │  │                                                        │ │
│            │  │  [🚩 Flag for Action]  [✓ Mark Reviewed]  [Archive]   │ │
│            │  └────────────────────────────────────────────────────────┘│
│            │                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- 🟢 rows are collapsed by default (only show header row); 🔴/🟡 rows are expanded with the explanation box
- "Flag for Action" changes status to `flagged` and optionally sends email to branch admin
- "Mark Reviewed" logs to ActivityLog: `hardware_scan_reviewed`
- Antivirus date difference is auto-classified as `warning` not `mismatch` since update is expected behavior
- Drive serial mismatch is hard `mismatch` — most likely indicator of hardware swap/theft

---

## Implementation Phases

> **Reordered 2026-07-03**: manual baseline entry dropped — parser comes FIRST since
> the baseline is now just the first accepted scan.

### Phase A — Belarc Parser *(was Phase B)* ✅ COMPLETE 2026-07-06
- [x] Install `node-html-parser` in `oracle-api`
- [x] Write `parseBelarc(html: string): ParsedSpecs` — `oracle-api/src/lib/belarc/` (types, section registry, parser); extracts the 21 recorded sections
- [x] Verify against a real Belarc export — done 2026-07-03 with `(Carter).html` (ASUS ROG Strix G513IC); structure confirmed
- [x] Tag each field with volatility tier (hard / soft / skip) — per-field via 12 custom extractors, section-default for the rest
- [x] Handle missing sections gracefully ("None detected" → empty section; absent → `meta.missingSections`; non-Belarc HTML → `NotABelarcReportError`)
- [x] Test suite: 20 vitest tests against the real export fixture (`__tests__/fixtures/carter.html`)

> ⚠ **Parser findings vs. this plan** (from the real export, 2026-07-06):
> - Section headers are `<h2 class="reportSectionHeader">`, **not divs** (bodies are divs)
> - One `.reportSection` div can hold **multiple** header+body pairs — parser pairs each `<h2>` with its sibling body
> - Footnote markers are `<sup>` tags appended to headers ("Memory c,d")
> - Virus Protection renders as a **table** in real exports, not text lines
> - Serials/drives/RAM slots/licenses live in `<table>` cells — parser extracts cell-by-cell

### Phase B — Scan Upload + Baseline
- [ ] Add `HardwareScan` model to Prisma schema (with `isBaseline`, `rawHtml`)
- [ ] `POST /api/hardware-audit/scan` — multipart HTML upload → parse → store; compare if baseline exists
- [ ] `PUT /api/hardware-audit/scans/:id/baseline` — accept scan as baseline (one per asset)
- [ ] `/hardware-audit/upload` page — 3-step flow (select asset, upload, preview)
- [ ] "Hardware" tab on `/assets/[id]` — shows baseline scan specs + scan history (read-only, no manual form)

### Phase C — Comparison Engine
- [ ] Field-by-field diff: new scan `parsedSpecs` vs baseline scan `parsedSpecs`
- [ ] Apply volatility tiers — hard → 🔴, soft → 🟡, skip → ignored
- [ ] Store `comparisonResult` JSON + `overallStatus` on the scan

### Phase D — Admin Review Queue
- [ ] `GET /api/hardware-audit/scans` — list with filters
- [ ] `PUT /api/hardware-audit/scans/:id/review` — mark reviewed / flag / archive
- [ ] `/hardware-audit` queue page
- [ ] `/hardware-audit/[scanId]` comparison detail page
- [ ] Sidebar badge for pending mismatches

### Phase E — Exit Check Integration *(deferred)*
- [ ] Trigger hardware audit requirement when employee offboarding starts
- [ ] Block return approval until scan submitted and reviewed

---

## Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Who uploads the scan — employee or admin? | **Either.** Employee uploads their own; admin can upload on behalf |
| 2 | Do we email admin when a new scan is submitted? | Open — email on `mismatch` only, or all scans? |
| 3 | ~~Belarc export format?~~ | ✅ **RESOLVED 2026-07-03** — single self-contained HTML at `Belarc\BelarcAdvisor\System\tmp\(ComputerName).html`, ~130 KB, `.reportSection` div structure verified |
| 4 | ~~No baseline exists?~~ | ✅ **RESOLVED** — first scan uploaded becomes baseline after admin clicks "Accept as baseline"; no manual entry |
| 5 | Phase E (exit check block) — required for launch? | Confirm with Sir Jay |
| 6 | Raw HTML storage — DB Text column or file storage? | ~130 KB each; DB Text fine for now, revisit if scan volume grows |

---

## Related

- [[Planning/Pages/Assets]] — Hardware tab adds to existing asset detail
- [[Planning/Pages/Employees]] — Exit check on employee offboarding
- [[Notes/Meeting_2026-06-28_Feature_Requests]] — Original Belarc request
- [[Planning/PLAN]] — Add as Phase 11 once decisions confirmed
