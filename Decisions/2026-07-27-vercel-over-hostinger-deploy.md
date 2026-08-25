---
date: 2026-07-27
tags: [decision]
status: Accepted
---

# ADR: Deploy to Vercel, not Hostinger

**Date**: 2026-07-27
**Status**: Accepted

## Decision

Deploy the SvelteKit app (`oracle-sv`) to **Vercel** using `adapter-vercel`. Hostinger VPS is **not** being pursued for now.

## Why

Vince decided to skip Hostinger for this round — no reasoning beyond "not doing Hostinger for now" was given. Vercel's zero-config deploy and free tier make it the faster path to get V2 live.

## Alternatives Considered

- **`adapter-node` on Hostinger VPS** — was the earlier lean (same host as the legacy live domain `oracleinventory.lubesmastery.com`, avoids a DNS migration). Rejected for now: Vince wants to skip Hostinger.

## Consequences

- `oracle-sv` needs `@sveltejs/adapter-vercel` instead of `adapter-node`
- `oracleinventory.lubesmastery.com` DNS will need to point at Vercel (or a new domain/subdomain gets used) — not yet decided, revisit when actually deploying
- No PM2 process management needed (Vercel handles hosting)
- `oracle-api` (Express backend) hosting is a separate question — not addressed by this decision, still needs a host (Vercel serverless functions, Railway, Render, etc. — TBD)
- Database stays on Neon (Postgres) regardless of frontend host — no change there

## Follow-up Tasks

- [ ] Install/configure `@sveltejs/adapter-vercel` in `oracle-sv`
- [ ] Decide `oracle-api` hosting (Vercel serverless vs separate host) — open question, not yet discussed
- [ ] Decide domain: repoint `oracleinventory.lubesmastery.com` to Vercel, or use a Vercel-issued domain
- [ ] Update `Planning/PLAN.md` §10 Open Decisions and §11 Environment Setup once adapter is installed

---

[[Decisions/README]] | [[Home]]
