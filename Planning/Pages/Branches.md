---
date: 2026-06-29
tags: [planning, page-spec]
---

# Branches — Spec

> Routes: `/branches`, `/branches/[id]`
> Status: Core done — map visualization pending
> Task status tracked in: [[Planning/Pages/_Overview#Branches]]

---

## Map Visualization

- Show all branches as pins on a geographic map
- Clicking a pin opens the branch detail (assets + employees at that branch)
- **Current**: Leaflet + Nominatim (free, live)
- **Decision pending**: Mapbox (better UX, clustered pins) adds cost — see [[Planning/PLAN]] §10 Open Decisions

## Add Branch with exact map pin (2026-07-30)

### Verified starting point

- `Branch` already has optional `address`, `latitude`, and `longitude` fields in the Supabase baseline schema; this proposal does **not** need a database migration.
- The create flow now accepts an explicitly selected coordinate pair; the detail-page editor also uses the same dedicated Branch permission.
- Branch mutations use the new `manage_branches` permission. It appears in the existing SuperAdmin Roles permission checklist after the pending Supabase migration is applied, so any role can receive it without receiving all system-settings access.

### Recommended MVP flow

1. Show **Add Branch** only to users with `manage_branches`; keep the API guard as the authority.
2. Collect a required branch name and optional human-readable address.
3. After the address is entered, let the user explicitly search for it, select a result, then click or drag a pin to confirm the exact site location.
4. Show the chosen coordinates and allow saving without a pin when the exact location is not yet known. Do not silently geocode or save an approximate/default point.
5. Persist the confirmed coordinate pair when creating or editing. The geographic Branches map must use those saved coordinates, never re-geocode every record on load.

### Service and safety boundary

- Keep Leaflet for the MVP. It is already bundled and is light for the expected number of branches; rendering a handful of pins is not a material performance concern.
- Do not add address autocomplete against public `nominatim.openstreetmap.org`. Its public policy forbids client autocomplete, caps all app traffic at one request per second, requires identifiable requests, and expects caching/switchability. Use an explicit search action only, with debounce/rate limiting and cached responses behind an application-owned geocoding adapter; make the provider configurable so it can later move to an approved paid provider or a self-hosted service.
- Treat branch addresses and coordinates as operational location data. Do not put them in diagnostic logs, fixtures, or analytics unless explicitly needed.
- Validate coordinates at the API boundary: finite latitude from -90 to 90 and longitude from -180 to 180; accept both values together or neither.

### Delivery and test gates

- API tests: unauthenticated and unauthorized create are rejected; an authorized create persists a valid coordinate pair; incomplete, non-finite, or out-of-range coordinates are rejected; update/clear behavior remains correct.
- Browser tests: permitted user can create, search/select, adjust, save, and see the new pin; non-permitted user cannot see mutation controls; geocode failure keeps the entered address and never invents a location.
- Production smoke test: verify the selected provider, attribution, CORS/API origin, RBAC, and actual map/pin rendering before treating the feature as live.

### Implementation and release boundary

- The user approved the free Leaflet + controlled Nominatim MVP and role-configured Branch access on 2026-07-30.
- Local code/test verification is complete. The versioned permission migration is prepared but deliberately not applied to the shared Supabase project in this session.
- Before release: apply the migration with its verification query, grant `manage_branches` to the intended role(s) in Roles, sign in again to refresh permissions, then perform the documented browser/API smoke test.

## Branch Detail

- Total asset count and employee count prominently shown
- Top asset categories at that branch listed

## Expansion Summary (planned 2026-08-22)

Branch detail becomes the main operational view for site-level infrastructure:

| Branch section | Source |
|---|---|
| Assets and employee counts | Computed from records |
| Computers, phones, BYOD, peripherals | Asset and assignment records |
| Network devices | Access points, managed/unmanaged switches, firewall, VLAN/IP/port records |
| CCTV/NVR | Camera locations, NVR channel assignments, recorder location |
| Servers | Domain controller, file server, firewall/server roles |
| ISP circuits | Provider, speed, modem, static/dynamic connection, addressing metadata |
| Tools/stock | Quantity-mode tool inventory and serialized equipment |

Sensitive network and security fields should be visible only to authorized roles. Raw usernames/passwords are never stored here; only secret references are allowed. See [[Planning/Inventory-Field-Dictionary]] and [[Planning/Pages/Inventory-Intake]].

---

[[Home]] | [[Planning/Pages/_Overview]]
