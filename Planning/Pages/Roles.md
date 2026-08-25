---
date: 2026-06-29
tags: [planning, page-spec]
---

# Roles — Spec

> Route: `/roles`
> Status: Core done — role types + UI improvements pending
> Task status tracked in: [[Planning/Pages/_Overview#Roles]]

---

## Role Types

| Role | Access Level |
|------|-------------|
| SuperAdmin | Full access, all branches — max 1 in system |
| Admin | Branch-scoped full access |
| Staff | Standard access (create/edit, no delete) |
| Viewer | Read-only across all pages |
| Scanner | Scan pages only (`/scan/mobile`, `/scan/review`) |

- Only one SuperAdmin allowed — block creation of second via UI + API
- UI: color-coded badge per role (SuperAdmin = red, Admin = orange, Staff = blue, etc.)
- Permission matrix: toggle switches instead of checkboxes (pending)

---

- `manage_branches`: independently grants Branch create, edit, archive, and delete actions. Assign it from the existing SuperAdmin-managed Roles checklist after migration `20260730123000_add_manage_branches_permission` is applied.

## Expansion Permissions (planned 2026-08-22)

Manual Mode and Belarc-assisted review need separate permission concepts before implementation:

| Permission concept | Purpose |
|---|---|
| `create_inventory_intake` | Start and save manual inventory drafts |
| `approve_inventory_intake` | Confirm draft values into official records |
| `review_belarc_observations` | Accept, reject, or conflict-resolve Belarc proposed fields |
| `manage_infrastructure_assets` | Edit switch, AP, firewall, server, CCTV/NVR, ISP records |
| `view_sensitive_network_fields` | View IP, VLAN, DNS, gateway, port mapping, and topology metadata |
| `manage_secret_references` | Add/edit secret-reference labels and rotation metadata; never raw secrets |

SuperAdmin should own all of these by default. Branch Admin can receive scoped intake and infrastructure permissions only for assigned branches.

[[Home]] | [[Planning/Pages/_Overview]]
