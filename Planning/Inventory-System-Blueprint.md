---
date: 2026-07-27
tags: [planning, architecture]
---

# Inventory System Expansion Blueprint

## Direction

Evolve Oracle Inventory from general asset tracking into a secure device and infrastructure operations system while retaining the current SvelteKit, Express, Prisma, and PostgreSQL modular-monolith stack.

The expansion covers computers/components, peripherals, phones/BYOD, network interfaces and addressing history, VLAN/subnets, ports/topology, access points, switches, firewalls, servers, CCTV cameras/NVR channels, ISP circuits, evidence, and controlled discovery integrations.

## Workbook Interpretation

`Inventory Systems.xlsx` is requirements input, not an import-ready inventory file. It defines hundreds of desired fields but has no canonical entity rows, stable IDs, cardinality rules, or approved sensitivity policy. Duplicate/typo fields must be normalized through a data dictionary.

Device usernames/passwords are rejected from inventory imports. The system stores only a secret-manager reference plus access/rotation metadata.

The approved dictionary and intake plan are now split into [[Planning/Inventory-Field-Dictionary]] and [[Planning/Pages/Inventory-Intake]]. Manual Mode is the official primary source for expanded inventory data; Belarc remains reviewed computer-hardware evidence only.

## Target Domain Modules

- Asset identity, lifecycle, condition, ownership, site, custodian, warranty, and maintenance.
- Device profiles, replaceable components, observations, evidence, and source precedence.
- Network interfaces, MAC/IP history, segments, VLANs, ports, and topology links.
- CCTV cameras/NVRs as assets plus explicit recorder-channel relationships.
- ISP/service circuits, bandwidth, addressing mode, provider/SLA metadata.
- Import batches, row provenance, validation, quarantine, conflicts, and reconciliation.
- Append-only audit events and least-privilege site/object authorization.

Use typed columns/tables for fields involved in identity, authorization, validation, filtering, joining, reporting, and workflows. Reserve flexible metadata for low-value vendor-specific attributes.

## Delivery Phases

1. Discovery: approve users, scale, workflows, field decisions, sensitivity, Belarc licensing, and secret handling.
2. Foundation: approve domain model, threat model, RBAC matrix, API contracts, migrations, recovery, and deployment architecture.
3. Security: remediate CORS/session/OTP/validation/authorization/secret/logging blockers.
4. Schema: additive versioned migrations, backfill, constraints/indexes, verification, and rollback/recovery.
5. Imports: canonical row-oriented templates, dry-run, quarantine, provenance, conflicts, and reconciliation.
6. UI: unified asset/device/network/CCTV details, topology, stale-data flags, and quality queue.
7. Discovery: provider-neutral adapter with a licensed BelManage/export integration if approved.
8. Operations: staging, performance/security tests, restore drill, pilot site, production rollout, and monitoring.

## Belarc Boundary

The current HTML parser/baseline workflow is implemented. Belarc Advisor is personal/non-commercial, so corporate production use requires confirmation of a supported BelManage license and integration method. No publicly documented general BelManage REST API was identified; contact Belarc for customer API, database view, export, connector, authentication, delta feed, limits, and custom-CMDB rights.

## Related Sources

- Current truth and read routing: [[Context]]
- Hosting and rollout: [[Planning/Pages/Deployment]]
- Detailed status: [[Planning/Pages/_Overview]]
- Existing Belarc feature: [[Planning/Pages/HardwareAudit]]
- Field dictionary: [[Planning/Inventory-Field-Dictionary]]
- Manual intake flow: [[Planning/Pages/Inventory-Intake]]
- Import system: [[Planning/Pages/Import]]
- Durable decisions: [[Decisions/README]]

[[Home]] | [[Context]] | [[Planning/PLAN]]
