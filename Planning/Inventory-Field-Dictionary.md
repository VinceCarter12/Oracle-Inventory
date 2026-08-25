---
date: 2026-08-22
tags: [planning, data-dictionary]
---

# Inventory Field Dictionary

This note converts `Inventory Systems.xlsx` into an implementation-ready field dictionary. The workbook remains a requirements questionnaire, not an import template. The canonical flow is defined in [[Planning/Pages/Inventory-Intake]] and the decision is recorded in [[Decisions/2026-08-22-manual-primary-belarc-assisted-intake]].

The first build target is narrowed in [[Planning/Phase-1-Computer-Intake-Spec]]: company computers/laptops only, Manual Mode first, branch required, `assetTag` canonical, duplicate computer names warning-only, optional initial assignment, and Belarc proposals disabled in production until commercial licensing is approved.

## Source Workbook

| Source | Observed structure | Interpretation |
|---|---|---|
| `C:\Users\vince\Downloads\Inventory Systems.xlsx` | One sheet, `Sheet1`, 360 rows, 6 columns | Field/specification list, not row-based inventory records |
| Rows 2-8 | User identity, site, department, position, employee number | Employee and assignment context |
| Rows 10-107 | Desktop/laptop/computer hardware plus monitors and peripherals | Asset, device profile, components, and accessories |
| Rows 109-130 | Email, storage count, company phone, BYOD, SSID | Employee contact, phone assets, and connectivity evidence |
| Rows 132-196 | Access points, cameras, NVR, managed/unmanaged switches | Infrastructure assets, interfaces, ports, CCTV links |
| Rows 198-262 | Firewall, domain controller, file server | Server/network assets with hardware profiles and IP settings |
| Rows 264-275 | ISP/modem/connectivity | ISP circuit and modem/router asset |
| Rows 277-360 | Tools, cables, presentation equipment, storage devices, docking stations | Asset records when serialized/tagged; stock records when quantity-only |

## Canonical Entity Map

| Workbook field family | Canonical entity | Data shape | Source mode | Display location | Role | Sensitivity | Conflict rule |
|---|---|---|---|---|---|---|---|
| Full name, first name, last name, middle name | `Employee` | Stored fields | Manual primary | Employee profile | Admin, SuperAdmin | Normal PII | Manual update requires activity log |
| Log-in domain, member of | `EmployeeIdentity` or future directory link | Structured references | Manual primary; future directory-assisted | Employee profile > Identity | SuperAdmin | Internal identity | Never infer from Belarc |
| Site, department, position, employee number | `Employee`, `Branch`, `Department` | Foreign keys and official identifiers | Manual primary | Employee profile, Branch detail | Admin, SuperAdmin | Operational PII | Branch/department must reference active records |
| Desktop count, laptop count, monitor count, tool counts | Computed summaries | Derived counts | System computed | Dashboard and Branch detail | All authorized viewers | Aggregated | Never manually editable |
| Computer name, laptop/desktop, brand, model, serial, company tag | `Asset` plus `DeviceProfile` | Stored fields | Manual primary; Belarc-assisted for computers only | Asset overview | Admin, SuperAdmin | Operational | Blank official fields can accept reviewed Belarc values; conflicts require approval |
| Processor, motherboard, OS, OS version, install date | `DeviceProfile` | Stored fields with observed source metadata | Manual primary; Belarc-assisted | Asset specs | Admin, SuperAdmin | Operational | Belarc can verify or propose; never silently overwrite |
| RAM slot sizes and serials | `AssetComponent` | Repeatable component records | Manual primary; Belarc-assisted | Asset specs > Components | Admin, SuperAdmin | Operational | Differences become hardware audit conflicts |
| SSD/HDD brand, model, serial, capacity | `AssetComponent` | Repeatable storage records | Manual primary; Belarc-assisted | Asset specs > Storage | Admin, SuperAdmin | Operational | Match verifies; serial mismatch is blocking conflict |
| IP address, subnet, gateway, DNS | `NetworkInterface` or `NetworkAddressObservation` | Repeatable interface/address records with observed dates | Manual primary; Belarc observation for computers | Asset connectivity | Admin, SuperAdmin | Network sensitive | Dynamic IP can expire; do not treat as permanent unless marked static |
| Monitors, keyboard, mouse, speaker, camera, printer, UPS, AVR | `Asset` when tagged/serialized; `PeripheralLink` when attached | Separate assets plus relationship to parent/user | Manual primary | Asset overview and Employee assignments | Admin, SuperAdmin | Operational | Belarc may observe peripherals but does not create official assets automatically |
| Email address | `Employee.email` and optional `EmployeeContact` | Stored field | Manual primary | Employee profile | Admin, SuperAdmin | PII | Validate uniqueness/format where required |
| Company phone, BYOD phone | `Asset` with ownership | Asset record | Manual primary | Employee assignments and Asset overview | Admin, SuperAdmin | PII/operational | BYOD must be visibly labeled personal-owned |
| SSID connected | `NetworkObservation` | Observation, not official identity | Manual or future collector | Asset connectivity | Admin, SuperAdmin | Network sensitive | Evidence only; never proof of assignment |
| Access point brand/model/serial/tag/VLAN/IP | `InfrastructureAsset`, `NetworkInterface`, `VlanAssignment` | Stored asset plus network details | Manual primary | Infrastructure or Asset detail | Admin, SuperAdmin | Network sensitive | Manual official values win over observations |
| Access point username/password | Secret manager reference only | `secretRef`, owner, rotation metadata | Manual reference only | Restricted security tab | SuperAdmin only | Secret | Reject raw secrets |
| CCTV camera name/location/NVR/channel/brand/model/serial/tag/IP | `CctvCamera`, `NvrChannel`, `NetworkInterface` | Asset plus channel relationship | Manual primary | CCTV/NVR page and Branch detail | Admin, SuperAdmin | Security sensitive | NVR/channel relationship must be explicit |
| Camera/NVR username/password | Secret manager reference only | `secretRef`, owner, rotation metadata | Manual reference only | Restricted security tab | SuperAdmin only | Secret | Reject raw secrets |
| Managed switch port assignment | `NetworkPort`, `PortConnection` | Repeatable port map | Manual primary | Infrastructure topology | Admin, SuperAdmin | Network sensitive | Keep history; do not overwrite without effective date |
| Firewall/server hardware and IP fields | `ServerAsset`, `DeviceProfile`, `NetworkInterface`, `ServerRole` | Asset plus role profile | Manual primary | Infrastructure or Server detail | SuperAdmin, selected Admin | Highly sensitive | Require elevated permission for edits |
| ISP name, speed, modem, static/dynamic connection, IP settings | `IspCircuit`, `Asset` modem, `NetworkInterface` | Circuit plus equipment | Manual primary | Branch connectivity | Admin, SuperAdmin | Network/vendor sensitive | Static details are official; dynamic details are observations |
| Tools and quantity-only consumables | `ToolInventory` or `Asset` | Quantity stock or serialized asset | Manual primary | Tools/stock inventory | Admin, SuperAdmin | Low/operational | Serialized/tagged items become assets; loose stock stays quantity-based |
| Duplicate/typo labels such as `Kayboard`, `Serail`, `Propety`, `Adresss`, duplicate Clicker group | Dictionary aliases | Alias mapping only | System normalization | Intake validation | Admin, SuperAdmin | Normal | Normalize labels before storage |

## Manual Intake Priority

Manual mode is the primary official source because the workbook includes fields Belarc cannot know: employee number, department, position, branch ownership, CCTV location, NVR channel, switch port assignment, ISP circuit, tool count, and secret-reference ownership.

Belarc is allowed only as a computer evidence source for selected safe hardware fields:

| Belarc candidate | Official field behavior |
|---|---|
| System model, system serial, OS, processor, RAM, motherboard, first MAC, asset tag when available | Can verify existing official values or propose values for blanks |
| Disk/RAM/GPU/peripheral observations | Can populate review evidence and component proposals after admin approval |
| Users, software licenses, last login, hotfixes, free space, raw secrets | Do not merge into official inventory fields |

## Required New Model Concepts

These are planning targets, not implemented schema:

| Concept | Why needed |
|---|---|
| `DeviceProfile` | Separates computer/server specs from generic asset identity |
| `AssetComponent` | Handles repeatable RAM, drives, GPUs, monitors, docks, and serialized internal parts |
| `NetworkInterface` | Handles MAC/IP/subnet/gateway/DNS without cramming networking into Asset |
| `NetworkPort` and `PortConnection` | Handles switch/NVR/camera/AP port assignments and topology history |
| `CctvCamera` and `NvrChannel` | Handles camera-to-recorder channel mapping |
| `IspCircuit` | Handles provider, speed, addressing mode, modem, SLA/account metadata |
| `ToolInventory` | Handles quantity-only tools/consumables that are not individually tagged |
| `InventoryObservation` | Stores Belarc/manual evidence without making it official immediately |
| `SecretReference` | Stores reference metadata only; raw usernames/passwords remain outside inventory |

## Page Placement

| Page | Fields shown |
|---|---|
| Assets | Identity, lifecycle, assignment, ownership, condition, source confidence |
| Asset detail > Specifications | CPU, RAM, storage, motherboard, OS, monitors, peripherals |
| Asset detail > Connectivity | MAC/IP/VLAN/SSID/ports/static-or-dynamic address |
| Asset detail > Audit and Sources | Manual changes, Belarc scans, conflicts, accepted source values |
| Employees | Identity, branch, department, position, email, assigned assets |
| Branches | Counts, branch devices, infrastructure, ISP circuits, CCTV coverage |
| Hardware Audit | Computer scan evidence, comparison, review, baseline, proposed safe field merge |
| Future Infrastructure view | Switches, APs, firewall, servers, CCTV/NVR, ISP circuits |
| Roles | Permissions for manual entry, Belarc review, infrastructure edit, secret reference edit |

## Validation Rules

- Reject raw passwords, usernames used as credentials, API keys, license keys, and copied secret values from inventory fields.
- Allow only secret reference labels, owner, system, last rotated date, and retrieval location when explicitly approved.
- Counts are derived from records whenever records exist; do not let users type branch laptop count as an official source of truth.
- Repeatable fields such as RAM slots, drives, monitors, HDD 1/2/3, and camera channels must be modeled as child rows.
- Every official change records who changed it, when, source mode, source confidence, and previous value.
- Belarc differences never overwrite official values automatically.

[[Home]] | [[Context]] | [[Planning/Inventory-System-Blueprint]] | [[Planning/Pages/Inventory-Intake]]
