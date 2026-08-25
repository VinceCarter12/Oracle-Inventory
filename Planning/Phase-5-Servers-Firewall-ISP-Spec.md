---
date: 2026-08-22
tags: [planning, specification]
---

# Phase 5 Servers, Firewall, and ISP Spec

> Status: Implementation-ready candidate; not implemented.

This phase adds server roles, domain/file servers, firewall profiles, ISP circuits, modem/router relationships, addressing modes, branch operations, and sensitive-data controls.

## Scope and Out of Scope

In scope: server profile records, server roles, firewall profile, ISP circuits, modem/router asset relationships, static/dynamic addressing metadata, branch operations views, APIs, RBAC, validation, and secret rejection.

Out of scope: firewall rule management, VPN credential storage, Active Directory integration, live server monitoring, ISP billing automation, and raw config backup storage.

## Field Dictionary and Cardinality

| Field | Entity | Type | Cardinality | Required | Notes |
|---|---|---|---|---|---|
| `assetId` | `ServerProfile` / `FirewallProfile` / equipment assignment | id | one typed profile per matching asset | yes | Asset remains identity/lifecycle. |
| `branchId` | `Asset` / circuit | id | one | yes | Branch operation anchor. |
| `environment` | `ServerProfile` | enum | one per server | yes | `production`, `staging`, `development`, `test`, `other`. |
| `criticality` | `ServerProfile` | enum | one per server | yes | `critical`, `high`, `medium`, `low`. |
| `virtualizationRole` | `ServerProfile` | enum | one per server | yes | `physical`, `hypervisor`, `virtual_machine`, `container_host`, `other`. |
| `serviceOwner`, `supportOwner`, `purpose` | `ServerProfile` | string/text | one / zero-or-one / zero-or-one | yes/no/no | Hardware and OS remain in `DeviceProfile`/`AssetComponent`. |
| `roleType` | `ServerRoleAssignment` | enum | many roles/history per server | yes | `domain_controller`, `file_server`, `application_server`, `database_server`, `backup_server`, `dns_server`, `dhcp_server`, `other`. |
| `roleName`, `domainName`, `isPrimary`, `validFrom`, `validTo`, `notes` | `ServerRoleAssignment` | typed fields | one history envelope per role | no/no/yes/yes/no/no | Domain/file roles are repeatable assignments, not Boolean columns. |
| `deploymentMode` | `FirewallProfile` | enum | one per firewall | yes | `routed_gateway`, `transparent_bridge`, `host_firewall`, `virtual_appliance`, `other`. |
| `haRole` | `FirewallProfile` | enum | one per firewall | yes | `standalone`, `active`, `passive`, `member`, `unknown`. |
| `policyOwner`, `managementInterfaceId`, `configurationArtifactRef` | `FirewallProfile` | string/refs | one / zero-or-one / zero-or-one | yes/no/no | Configuration ref points to an approved encrypted repository, never raw rules/config. |
| `providerName`, `circuitLabel` | `IspCircuit` | strings | one each per circuit | yes | Branch has many circuits. |
| `serviceType` | `IspCircuit` | enum | one | yes | `fiber`, `dsl`, `cable`, `wireless`, `leased_line`, `satellite`, `other`. |
| `status` | `IspCircuit` | enum | one | yes | `planned`, `active`, `degraded`, `suspended`, `terminated`. |
| `demarcLocation` | `IspCircuit` | string | zero or one | no | Sensitive operational location. |
| `downloadMbps`, `uploadMbps` | `IspCircuit` | positive decimal | one pair per circuit | yes | Explicit Mbps; zero/negative rejected. |
| `addressingMode` | `IspCircuit` | enum | one | yes | `static`, `dhcp`, `dynamic`, `pppoe`, `cgnat`, `unknown`. |
| `activatedAt`, `terminatedAt`, `providerCircuitIdMasked` | `IspCircuit` | datetime/string | zero or one each | no | Full account identifiers remain outside general inventory. |
| `role`, `validFrom`, `validTo` | `CircuitEquipmentAssignment` | enum/datetimes | many circuit/equipment history rows | yes/conditional | Roles: `ont`, `modem`, `router`, `firewall`; same branch unless approved shared/global service. |
| `address`, `prefixLength`, `gateway`, `validFrom`, `validTo` | `IspCircuitAddress` | inet/integer/datetimes | many static/history rows per circuit | conditional | Static mode requires approved rows; dynamic modes must not claim permanent IP truth. |
| `secretReferenceId` | secret junction | id | zero or many | no | Metadata only. |

Counts and branch connectivity summaries are derived from active circuits and assets.

## Canonical Entity/Data Model Proposal

| Entity | Purpose | Relationship |
|---|---|---|
| `Asset` | Server, firewall, modem/router identity/lifecycle | parent |
| `DeviceProfile` / `AssetComponent` | Hardware and OS for servers | typed Phase 1 records, not duplicated here |
| `ServerProfile` | Environment, criticality, ownership, and purpose | one to one server Asset |
| `ServerRoleAssignment` | Effective-dated repeatable server functions | server one-to-many |
| `FirewallProfile` | Firewall-specific operational metadata | one to one firewall asset |
| `IspCircuit` | Provider, service, speed, addressing mode, lifecycle | branch one-to-many |
| `CircuitEquipmentAssignment` | Effective-dated modem/router/firewall/ONT relationships | circuit many-to-many Assets over time |
| `IspCircuitAddress` | Static address/history for a circuit | circuit one-to-many |
| `NetworkInterface` | Private/network addressing from Phase 3 | linked, not duplicated |
| `SecretReference` plus `IspCircuitSecretReference` | External secret pointer and explicit circuit junction | circuit many-to-many references |

## Manual Entry Flow and Source Precedence

Manual intake creates or links server/firewall/modem assets, assigns branch, then adds role/circuit/profile details. Static values are official only when entered or approved by authorized users. Dynamic ISP/public IP values are observations with timestamps. Existing Asset lifecycle remains the source for active/lost/stolen/condition.

## Belarc Relationship

Belarc may support server hardware specs only if the machine is treated as a computer/server scan under Phase 2 rules and commercial rights allow it. It cannot supply firewall/ISP authority, credentials, branch topology, domain trust, file-share permissions, or public IP truth without manual review.

## Route/Page Ownership and UX States

| Route/page | Ownership | UX states |
|---|---|---|
| `/inventory/intake/server` | Intake | draft, role selection, restricted fields, review |
| `/inventory/intake/firewall` | Intake | draft, addressing, interface references, secret-reference prompt |
| `/inventory/intake/isp` | Intake | circuit draft, modem/firewall links, dynamic observation |
| `/infrastructure/servers` | Future infrastructure view | branch list, roles, stale observation warnings |
| `/infrastructure/firewalls` | Restricted security-infrastructure view | incomplete profile, hidden fields, HA/shared-service state, retry |
| `/infrastructure/connectivity` | Future branch ops view | primary/failover circuits, modem/router relationships |
| `/assets/[id]` | Asset detail | profile tab, roles, interfaces, sensitive-field gating |
| `/branches/[id]` | Branch detail | server/firewall/ISP summary |

## API Contract Direction

| Endpoint | Request direction | Response direction |
|---|---|---|
| `PUT /api/servers/:assetId/profile` | profile fields plus `expectedUpdatedAt` | profile or `409 STALE_WRITE` |
| `POST /api/servers/:assetId/roles` | role/history fields and `Idempotency-Key` | role assignment |
| `PUT /api/firewalls/:assetId/profile` | approved metadata plus expected version | firewall profile; raw configs rejected |
| `POST /api/isp-circuits` | branch, provider/service/speeds/mode; `Idempotency-Key` | circuit record |
| `POST /api/isp-circuits/:id/equipment` | asset, role, validFrom | effective-dated relation |
| `POST /api/isp-circuits/:id/addresses` | static address/history fields | circuit address row |
| `/api/isp-circuits/:id/secret-references` | approved reference id and purpose only | minimized junction metadata |

List endpoints return `{ items, page, pageSize, total }`; unknown fields are rejected and errors preserve `{ error, code, fieldErrors }`. Authorization derives branch from loaded server/firewall/circuit/equipment records, never the request body.

## RBAC and Branch/Object Authorization

Require `manage_infrastructure_assets` for ordinary branch-scoped writes and `view_sensitive_network_fields` for domains, IPs, gateways, circuit identifiers, management interfaces, and topology. Firewall/configuration-reference edits default to SuperAdmin or future `manage_security_infrastructure`. Shared/global infrastructure cannot be edited by a single-branch Admin. Secret-reference authority stays separate, and every endpoint must resist guessed-ID and branch-filter substitution.

## Sensitive-Data and Secret-Rejection Rules

Reject domain admin credentials, local admin passwords, firewall passwords, VPN keys, PPPoE passwords, ISP portal logins, Wi-Fi passwords, API tokens, backup keys, and product/license keys. Do not log rejected values. Store only approved `SecretReference` metadata.

## Additive Migration, Compatibility, Backfill, Rollback

Add typed tables, permissions, temporal indexes, and constraints after Phase 3 networking and the Phase 4 secret-reference primitive. Backfill only clear server/firewall category matches and never infer roles from names; legacy metadata remains read-only evidence. Rollback disables writes and uses forward-fix migrations without deleting history. Restore drills must reconcile server-role, circuit-equipment, address, and external-reference integrity.

## Test and Acceptance Gates

Test temporal roles/equipment, duplicate primary roles, static/dynamic/PPPoE/CGNAT behavior, shared-service restrictions, branch/object IDOR, sensitive masking, raw-config and secret rejection, archive dependencies, idempotency, and stale writes. Browser smoke loading/empty/restricted/error/retry states, server intake, firewall profile, ISP linking, primary/failover explanation, branch summary, and a structured accessible alternative to diagrams. Security review must prove no rulesets, PSKs, private keys, credentials, or backups are stored.

## Dependencies and Owner Decisions Still Needed

Server role taxonomy, whether domain names/share names are visible to Branch Admin, ISP circuit identifier sensitivity, failover status definitions, approved secret-vault naming, and whether Belarc is allowed for servers under the commercial license.

## Estimated Complexity

Very high.

[[Home]] | [[Context]] | [[Planning/Inventory-Field-Dictionary]] | [[Planning/Phase-3-Network-Infrastructure-Spec]] | [[Planning/Phase-7-Cross-Phase-Release-and-Operations-Spec]]
