---
date: 2026-06-29
tags: [planning, page-spec]
---

# Deployment - Vercel + Supabase Target

> Frontend decision: **Vercel** with `adapter-vercel` — Hostinger dropped 2026-07-27; see [[Decisions/2026-07-27-vercel-over-hostinger-deploy]]
> Status: Partial provider setup verified 2026-07-28 — Render API is Live; Vercel Preview is Ready; Vercel Production is not yet successful
> Detailed task status: [[Planning/Pages/_Overview#Deployment]]
> Hands-on guide: [[Notes/Hosting-Setup-Tutorial]]

## Recommended Production Topology

| Layer | Provider | Reason |
|---|---|---|
| Frontend/SSR | Vercel, project root `oracle-sv` | Accepted ADR; first-class SvelteKit support and preview deployments |
| API | Vercel Node function, project root `oracle-api` | Accepted target; the existing Express app is being extracted behind a catch-all function, but uploads/OCR must pass a real preview validation before cutover |
| Database | Supabase PostgreSQL | Accepted managed Postgres target; Prisma remains the sole schema authority |
| Scheduled work | Vercel Cron calling an idempotent one-shot route | Replace process-local `node-cron`; keep the current scheduler disabled until this is implemented and verified |
| Email | Resend with verified organizational sender domain | Already used in code; API key stays only in the API provider secret store |
| DNS/TLS | Existing DNS provider to Vercel; optional `api.` subdomain to Render | Preserve the public domain while separating frontend/backend ownership |

Render is now the configured API host. Railway remains a viable alternative only if a later provider change is approved. Do not move the current API into Vercel functions until uploads, OCR runtime, cron, timeouts, and database connections are deliberately refactored and tested.

Render remains temporary during this migration. Do not remove it or cut it over until the Vercel API preview has passed routing, authentication, upload, OCR, import, and timeout tests against a non-production Supabase database.

## Supabase + Vercel Cutover Gates

1. Commit and test the generated Prisma baseline on an empty disposable Supabase database.
2. Reconcile the existing Neon schema and data; take a restorable backup and prove a restore before any production move.
3. Create a Vercel project rooted at `oracle-api`; configure only server-side secrets there. `PUBLIC_API_BASE_URL` belongs only in `oracle-sv`.
4. Verify `/api/*` routing, preflight CORS, login, binary downloads, multipart import/Belarc uploads, OCR timeouts, and the scheduler replacement on a Vercel Preview.
5. Run the final Neon-to-Supabase data copy, compare schema/row/FK checks, then switch the API runtime `DATABASE_URL` once.
6. Keep Neon read-only through the stabilization window. Do not delete Render or Neon as part of this batch.

## Verified Deployment Evidence — 2026-07-28

- Render `oracle-inventory-api` is **Live** on commit `439deca`; its Health Check Path is `/health` and the endpoint returned `{ "status": "ok" }`.
- Render uses Node `20.20.2` and the verified build command `npm ci --include=dev && npx prisma generate && npm run build`.
- Vercel Preview for commit `81136f2` (`fix(web): pin Vercel Node 20 runtime`) is **Ready**.
- Vercel Production on `main` (`439deca`) remains **Error**, and `oracle-inventory.vercel.app` has **No Deployment**. The Inventory website is therefore not production-live.
- Render being live does not close the production gates below: its CORS policy, migrations/recovery, API-origin wiring, role testing, email, uploads/OCR, and DNS are still unverified.

## Source of Truth and Environments

- [[Context]] records whether hosting claims are accepted, recommended, configured, staging-verified, or production-verified.
- Use local, staging/preview, and production environments.
- Vercel Preview deployments must never connect to production data.
- Staging uses separate Render service/secrets and a separate Neon branch/database.
- Production secrets live only in provider secret stores. Never commit `.env` values.

## Required Code Preparation

1. Install and pin `@sveltejs/adapter-vercel`; replace `adapter-auto` in `oracle-sv/svelte.config.js`.
2. Route browser API calls directly to a stable Render API origin through one centralized, environment-aware client. Add a public API-base variable, migrate remaining direct relative fetches/uploads, and verify multipart uploads, authorization headers, raw Belarc retrieval, response sizes, and timeouts. Vercel does not recommend `vercel.json` rewrites for SvelteKit, so do not make an external rewrite the default design.
3. Implement an explicit CORS allowlist. The current API reflects any origin and does not use `CORS_ORIGIN`.
4. Add readiness checks for required configuration and database connectivity, separate from lightweight liveness.
5. Replace production `prisma db push` with a versioned migration baseline and `prisma migrate deploy`. Seed production only through an explicit reviewed bootstrap.
6. Separate scheduled maintenance from API startup or make it provably idempotent with a single-run lock.
7. Complete production auth/OTP/session and secret-handling blockers documented in [[Context]].
8. Add CI gates for API tests/build, frontend check/build, migration validation, and dependency/security review.

## Provider Configuration

### Vercel - `oracle-sv`

1. Import the Git repository and set Root Directory to `oracle-sv`.
2. Use the pinned Vercel adapter and `npm run build`.
3. Configure Preview and Production separately.
4. Configure the approved public API origin and only non-secret public environment values.
5. Keep provider system/private variables server-only; never expose secrets through public SvelteKit environment modules.
6. Validate login, protected routes, uploads, scan mobile flow, and raw hardware-audit reports on the Preview URL.

### Render - `oracle-api` recommendation

1. Create a Node Web Service with Root Directory `oracle-api` in a region close to Neon and primary users.
2. Build with dependency install, Prisma client generation, and `npm run build`; start with `npm start`.
3. Set `/health` initially, then a dedicated readiness endpoint, as the health-check path.
4. Configure runtime `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, allowed origins, and approved Zoho variables if enabled.
5. Set auto-deploy only after CI passes.
6. Create a scheduled job after extracting an idempotent maintenance command from API startup.

### Neon - PostgreSQL

1. Create separate staging and production branches/databases with least-privilege roles.
2. Use pooled connections for API traffic and a direct connection for migrations, dumps, and restore tooling when required.
3. Establish the migration baseline before the first production deploy.
4. Define backup retention, recovery point objective, recovery time objective, and a tested point-in-time restore procedure.
5. Run verification queries and reconciliation after every migration; provider success alone is not application correctness.

### Domain and TLS

1. Verify the Vercel deployment on its generated domain first.
2. Verify the Render API on its generated domain and through the chosen frontend API route.
3. Point `oracleinventory.lubesmastery.com` to Vercel only after staging and production smoke gates pass.
4. If direct browser-to-API calls are chosen, create `api.oracleinventory.lubesmastery.com`, restrict CORS to approved app/preview origins, and verify TLS before changing the frontend.

## Release Sequence

1. Freeze and document the production release candidate.
2. Deploy staging migrations and reconcile data.
3. Deploy staging API; verify health, auth, email, uploads, OCR, imports, Belarc, jobs, and logs.
4. Deploy Vercel Preview and complete role/permission end-to-end tests.
5. Prepare production secrets and verify a recoverable database restore point.
6. Run reviewed production migrations.
7. Deploy API, then frontend, while the old domain still targets the legacy service.
8. Run production smoke tests on provider-generated URLs.
9. Change DNS and monitor errors, latency, email, database connections, and critical workflows.
10. Record provider URLs, commit, migration, evidence, and rollback point in the journal.

## Rollback and Recovery

- Frontend: promote the last known-good Vercel deployment.
- API: roll back to the last known-good Render deploy.
- Database: use the approved forward-fix/reverse migration or Neon restore point; never roll back code across an incompatible schema.
- DNS: retain previous records and TTL plan until the stabilization window ends.
- Reconcile writes made during a failed release before retrying.

## Production Go-Live Gate

Go live only when builds/tests pass; migrations and recovery are verified; secrets and CORS are correct; staging role/permission flows pass; uploads/imports/Belarc/OTP email pass; logs and alerts are visible; and a named owner can execute rollback.

## Operating Decision Recorded

Render is the active API host. Before production cutover, record cost, Singapore-region free-instance cold-start behavior, upload/runtime limits, scaling, logs, secrets, backups, and operational ownership in a deployment ADR.

---

[[Home]] | [[Context]] | [[Planning/PLAN]] | [[Planning/Pages/_Overview]]
