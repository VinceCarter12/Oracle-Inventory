---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 3 Network Infrastructure Spec

> Status: Implementation-ready candidate; not implemented.

This phase adds branch-scoped network inventory: interfaces, IP observations/history, VLANs, switches, ports, topology links, and branch connectivity. Manual entry is official. Belarc may provide computer interface observations only after [[Planning/Phase-2-Belarc-Proposal-Hardening-Spec]].

## Scope and Out of Scope

In scope: manual intake for switches, access points, network interfaces, IP observations, VLANs, ports, topology links, branch connectivity summary, APIs, RBAC, validation, accessibility, additive migrations, and rollback.

Out of scope: automatic network scanning, SNMP polling, credential storage, production network monitoring, ISP circuit contracts covered in [[Planning/Phase-5-Servers-Firewall-ISP-Spec]], and CCTV channel assignments covered in [[Planning/Phase-4-CCTV-NVR-Spec]].

## Field Dictionary and Cardinality

| Field | Entity | Type | Cardinality | Required | Notes |
|---|---|---|---|---|---|
| `assetId` | `NetworkInterface` / `NetworkPort` | id | many interfaces/ports per asset | yes | `Asset` category identifies switch, AP, router, firewall, patch panel, or other network equipment. |
| `branchId` | `Asset` / topology | id | one branch per official device | yes | Branch-scoped authorization anchor. |
| `vlanNumber` | `Vlan` | integer | one per VLAN | yes | 1-4094 and unique per branch; reserved-VLAN policy is owner-owned. |
| `vlanName` | `Vlan` | string | one | no | Human label. |
| `interfaceName` | `NetworkInterface` | string | many per asset | yes | Example: `eth0`, `LAN1`, `mgmt`. |
| `macAddress` | `NetworkInterface` | string | zero or one | no | Normalize and unique where policy requires. |
| `address`, `prefixLength` | `IpAddressObservation` | inet/integer | many per interface | yes | IPv4 prefix 0-32; IPv6 0-128; family is derived. |
| `addressingMode` | `IpAddressObservation` | enum | one per row | yes | `static`, `dhcp`, `dynamic`, or `unknown`. Static rows are manual official configuration; dynamic rows are dated observations. |
| `gateway` | `IpAddressObservation` | inet/string | zero or one | no | Network-sensitive field. |
| `dnsServers` | `IpAddressObservation` | string array | zero or many | no | Network-sensitive field. |
| `source`, `observedAt`, `validFrom`, `validTo` | `IpAddressObservation` | enum/datetimes | one history envelope per row | yes/conditional | `validTo` must be later than `validFrom`; expiry policy is owner-owned. |
| `taggingMode`, `isNative` | `InterfaceVlanAssignment` | enum/boolean | many assignments over time | yes | Effective-dated interface-to-VLAN membership. |
| `portNumber` | `NetworkPort` | string | many per asset | yes | Unique per asset. |
| `portLabel` | `NetworkPort` | string | zero or one | no | Front-panel label. |
| `medium`, `speedMbps`, `poeCapability`, `adminStatus`, `operationalStatus` | `NetworkPort` | typed values | one set per port | yes/optional | Operational status is an observation, not implied live monitoring. |
| `fromPortId` | `PortConnection` | id | one per link | yes | Owning port endpoint. |
| `toPortId` / `toInterfaceId` | `PortConnection` | id | exactly one target per link | yes | Never both; one active physical connection per port. |
| `linkType`, `branchId` | `PortConnection` | enum/id | one each | yes | Cross-branch WAN links require explicit type and elevated authority. |
| `effectiveFrom` | topology/history | datetime | one | yes | Topology history start. |
| `effectiveTo` | topology/history | datetime | zero or one | no | Closed when replaced. |

Counts such as port count, connected-port count, and branch infrastructure count are derived from records.

## Canonical Entity/Data Model Proposal

| Entity | Purpose | Relationship |
|---|---|---|
| `Asset` | Identity/lifecycle for switches, APs, routers, patch panels | parent |
| `NetworkInterface` | MAC/interface identity | many to one `Asset` |
| `IpAddressObservation` | IP/subnet/gateway/DNS observations over time | many to one interface |
| `Vlan` | Branch-scoped VLAN dictionary | many per branch |
| `InterfaceVlanAssignment` | Effective-dated interface/VLAN membership | many-to-many over time |
| `NetworkPort` | Physical or logical ports | many to one asset |
| `PortConnection` | Effective-dated physical topology link | from one port to exactly one port or interface |

## Manual Entry Flow and Source Precedence

Manual intake creates the official asset and branch first, then profile, interfaces, ports, VLANs, and links. Historical observations do not overwrite official static addressing unless explicitly promoted. Belarc can only create computer interface observations and cannot create switch/router topology.

## Belarc Relationship

Belarc relationship is limited to computer/laptop `NetworkInterface` and `IpAddressObservation` proposals after Phase 2 hardening. It cannot define VLAN authority, branch topology, switch ports, firewall rules, ISP circuits, or credentials.

## Route/Page Ownership and UX States

| Route/page | Ownership | UX states |
|---|---|---|
| `/inventory/intake/network` | Intake | draft, validation errors, duplicate MAC/IP warnings, review |
| `/assets/[id]/connectivity` | Asset detail | no interfaces, active addresses, expired observations, topology links |
| `/infrastructure/network` | Operations list | list, filters, branch summary, disconnected devices; links to canonical Asset editors |
| `/branches/[id]` | Branch detail | infrastructure summary, VLANs, switch/AP counts, connectivity gaps |
| `/infrastructure/network/topology` | Topology workspace | empty, filtered-empty, partial, orphan, branch mismatch, stale conflict, retry, effective-date history |

Accessibility: all topology links need table alternatives, keyboard focus order, non-color-only status labels, and branch filter persistence.

## API Contract Direction

| Endpoint | Request direction | Response direction |
|---|---|---|
| `POST /api/network/interfaces` | owning asset plus interface fields; `Idempotency-Key` | created interface and activity id |
| `GET /api/network/interfaces` | branch, asset, type, q, pagination | `{ items, page, pageSize, total }` within derived object scope |
| `PUT /api/network/interfaces/:id` | official edits plus `expectedUpdatedAt` | updated interface or `409 STALE_WRITE` |
| `POST /api/network/interfaces/:id/ip-observations` | address, mode, observedAt, source | observation/history row |
| `POST /api/network/vlans` | branch, VLAN number, name, CIDR, gateway | VLAN dictionary row |
| `POST /api/network/vlan-assignments` | interface, VLAN, tagging, effective date | effective-dated assignment |
| `POST /api/network/ports` | asset, port number, medium/capability | created port |
| `POST /api/network/connections` | from port, exactly one endpoint, effectiveFrom | new history row; prior link is ended explicitly |
| `GET /api/branches/:branchId/connectivity` | branch id | derived current summary and data-quality warnings |

Unknown fields are rejected. Mutations use optimistic concurrency; creates/connections accept `Idempotency-Key`; error payloads preserve `{ error, code, fieldErrors }`.

## RBAC and Branch/Object Authorization

Require `manage_infrastructure_assets` for writes and `view_sensitive_network_fields` for IP, VLAN, gateway, DNS, and topology detail. Branch Admin writes only within assigned branch. Cross-branch topology links require SuperAdmin or explicit global infrastructure permission.

## Sensitive-Data and Secret-Rejection Rules

Do not store switch/AP/router usernames, passwords, SNMP communities, VPN pre-shared keys, Wi-Fi passwords, API keys, or recovery codes. Only store `SecretReference` metadata after the canonical Phase 4 shared secret-reference primitive and Phase 7 release controls are approved.

## Additive Migration, Compatibility, Backfill, Rollback

Add tables and current/history indexes without removing `Asset.macAddress`. Backfill a legacy MAC into a typed interface only when it validates, the owning branch is known, and collision checks pass; collisions and ambiguous categories go to a review report. Dual-read during compatibility uses typed rows first and the legacy field only as fallback. Rollback disables writes and uses forward fixes while preserving history; no data-destructive production down migration.

## Test and Acceptance Gates

Test IPv4/IPv6 prefixes, MAC normalization, VLAN range/reserved policy, temporal overlap, duplicate ports, one active link per port, same/cross-branch rules, guessed-ID/filter-substitution IDOR, query plans, restore of all history, and no manual count editing. Browser smoke must cover loading, empty, permission, validation, stale, retry, interface/IP/VLAN/link flows, branch summary, and a keyboard/screen-reader usable table alternative to topology.

## Dependencies and Owner Decisions Still Needed

Network device category list, VLAN naming convention, IP retention period, topology page priority, cross-branch link policy, and whether static IP uniqueness is branch-wide or subnet-wide.

## Estimated Complexity

Very high.

[[Home]] | [[Context]] | [[Planning/Inventory-Field-Dictionary]] | [[Planning/Pages/Branches]] | [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]]
