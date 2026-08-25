---
date: 2026-07-27
tags: [note, planning]
---

# Hosting Setup Tutorial - Oracle Inventory

> Target: Vercel (`oracle-sv`) + Render (`oracle-api`) + Neon PostgreSQL + Resend. Follow this in order. Do not point the production domain at the new stack until the staging and production-provider URLs pass the release gates.

## 1. Know What Is Ready Today

The repository is not ready for a safe production deploy yet:

- The frontend still uses `@sveltejs/adapter-auto` rather than a pinned `@sveltejs/adapter-vercel`.
- Browser calls use relative `/api/*` URLs and the local Vite proxy only; production API routing is not implemented.
- The API reflects any request origin instead of enforcing an approved CORS allowlist.
- `/health` is only a liveness response and does not verify database/config readiness.
- Maintenance cron starts inside every API process.
- There is no `oracle-api/prisma/migrations/` history; production currently has no reviewed `prisma migrate deploy` path.
- The working tree contains many uncommitted changes on `feat/dashboard-reports-merge`; create and review a clean release branch/commit before connecting auto-deploy.

## 2. Accounts and Access Vince Must Prepare

Use the organization/company owner where possible, enable MFA, and avoid personal shared passwords.

1. GitHub access to `VinceCarter12/Oracle-Inventory` and permission to connect provider apps.
2. Vercel account/team for the frontend.
3. Render account/workspace for the API and scheduled job.
4. Neon account/project for PostgreSQL.
5. Resend account with an approved sender domain.
6. DNS access for `lubesmastery.com`.
7. A password manager or secret manager for recovery codes and provider ownership records.

Record the owner, billing contact, recovery contact, MFA method, project name, and environment for each provider. Do not put passwords, database URLs, API keys, or recovery codes in this vault or chat.

## 3. Rotate Existing Local Credentials First

`oracle-api/.env` is correctly ignored by Git, but it contains real-looking development credentials. Before reusing or configuring any hosted environment:

1. Rotate the Neon database password/role credential.
2. Revoke and recreate the Resend API key.
3. Generate a new high-entropy JWT secret for each environment.
4. Keep local, staging, and production values different.
5. Enter hosted secrets directly in Neon/Render/Vercel dashboards; never paste them into documentation, commits, screenshots, or tickets.

## 4. Code Readiness Work Before Provider Setup

This is Codex implementation work and needs a reviewed branch/commit.

1. Pin `@sveltejs/adapter-vercel` and update `oracle-sv/svelte.config.js`.
2. Add one environment-aware API base URL strategy. Recommended: direct browser calls to a stable Render API domain through a centralized client using `PUBLIC_API_BASE_URL`. Convert direct `fetch('/api/...')` calls and uploads to the same strategy.
3. Change API CORS to an exact allowlist for local, staging, and production origins. Do not reflect arbitrary origins.
4. Add `/ready` that checks required configuration and a small database query; retain `/health` as lightweight liveness.
5. Explicitly listen on Render's `PORT` and `0.0.0.0`.
6. Extract maintenance execution into a command that runs once and exits. Remove the production scheduler from API startup or protect it with a database-backed single-run lock.
7. Baseline the existing Prisma schema and create a committed `prisma/migrations/` history. Use `prisma migrate deploy` in staging/production, never `prisma db push`.
8. Add API `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` placeholders to `.env.example`; keep all example values fake.
9. Run API tests/build plus frontend check/build before pushing the release candidate.

## 5. Create Neon Staging First

Recommended isolation is separate `oracle-inventory-staging` and `oracle-inventory-production` Neon projects. If the selected plan makes that impractical, use separate staging and production branches/databases and document the weaker isolation.

### Dashboard steps

1. Sign in to Neon and create `oracle-inventory-staging` in the region closest to the Render API region.
2. Create an application role with only the permissions the API requires; do not use an owner/admin role for normal runtime traffic.
3. From **Connect**, copy two connection strings:
   - Pooled connection for Render runtime `DATABASE_URL`.
   - Direct connection for controlled migrations, dumps, and restore work.
4. Store both only in the appropriate provider/CI secret scopes.
5. Apply the reviewed migration baseline to staging through the migration pipeline.
6. Run schema and row-count verification queries, then test backup/restore before creating production.

Do not copy real production data into staging unless it is approved and sanitized.

## 6. Create the Render Staging API

### Dashboard steps

1. In Render, choose **New > Web Service** and connect the GitHub repository.
2. Select the reviewed deployment branch.
3. Set **Root Directory** to `oracle-api`.
4. Select the Node runtime and the region closest to Neon and the primary users.
5. Use the reviewed commands:

```text
Build Command: npm ci && npx prisma generate && npm run build
Start Command: npm start
Health Check Path: /health
```

6. Do not manually force `PORT=3001`; Render supplies `PORT`. The code must bind to that value on `0.0.0.0`.
7. Add staging-only environment variables:

```text
DATABASE_URL=<staging pooled Neon URL>
JWT_SECRET=<staging-only random secret>
CORS_ORIGIN=<exact stable staging frontend origin>
RESEND_API_KEY=<staging/restricted Resend key>
EMAIL_FROM=<verified staging sender>
APP_URL=<stable staging frontend URL>
ZOHO_CLIENT_ID=<only if approved>
ZOHO_CLIENT_SECRET=<only if approved>
ZOHO_REFRESH_TOKEN=<only if approved>
ZOHO_ORG_ID=<only if approved>
```

8. Deploy with auto-deploy disabled initially.
9. Verify the generated `onrender.com/health` URL, logs, database connection, and `/ready` once implemented.
10. Add a stable staging API custom domain only after the generated URL works.

## 7. Create the Vercel Staging Frontend

### Dashboard steps

1. In Vercel, choose **Add New > Project** and import `VinceCarter12/Oracle-Inventory`.
2. Set **Root Directory** to `oracle-sv`.
3. Confirm **Framework Preset: SvelteKit**.
4. Use `npm run build`; leave the output directory on framework auto-detection.
5. Set `PUBLIC_API_BASE_URL` to the stable staging Render API origin after the code supports it.
6. Scope staging values to Preview only. Do not connect a Preview deployment to production Neon.
7. Deploy and test the generated `vercel.app` URL.
8. For a stable CORS target, assign a staging subdomain such as `inventory-staging.lubesmastery.com` before completing end-to-end tests.

Do not store database, JWT, Resend, or Zoho secrets in public SvelteKit variables. Only the public API origin belongs in `PUBLIC_API_BASE_URL`.

## 8. Staging Verification

Verify all of the following before creating production services:

1. Health and readiness responses.
2. Login, logout, token expiry, reset/OTP email, and first-login flow.
3. Every role and permission boundary, including direct URL/API attempts.
4. Asset CRUD, assignment/return, employees, branches, reports, and activity log.
5. Excel/CSV imports with dry-run, invalid rows, and duplicate handling.
6. Belarc upload, comparison, raw report access, and review workflow.
7. Image/document upload size, type validation, OCR duration, and failure handling.
8. Scan/mobile workflows.
9. Maintenance command manual run, duplicate prevention, and email delivery.
10. Logs contain no tokens, passwords, database URLs, sensitive imports, or raw credentials.
11. Migration rehearsal and tested restore.
12. Frontend/API behavior after cold start and provider restart.

Save URLs, commit SHA, migration version, test evidence, and failures in the journal.

## 9. Create Production

Only after staging passes:

1. Create a separate production Neon project/database and least-privilege runtime role.
2. Configure the production Render Web Service with production-only secrets.
3. Apply reviewed migrations using the direct production connection in controlled CI; use the pooled URL for API runtime.
4. Deploy and smoke-test the Render-generated URL.
5. Configure Vercel Production with the production API origin and deploy the reviewed commit.
6. Smoke-test the Vercel-generated production URL while the legacy domain remains untouched.
7. Create the production Render Cron Job only after the one-shot maintenance command is implemented. Render schedules use UTC, so convert Manila time deliberately.

## 10. Domain Cutover

1. In Vercel Project **Settings > Domains**, add `oracleinventory.lubesmastery.com`.
2. Use the exact DNS record Vercel displays. Because this is a subdomain, this will normally be a CNAME, but do not guess its target.
3. If using `api.oracleinventory.lubesmastery.com`, add it to the Render service and use the exact Render-provided DNS record.
4. Lower the existing DNS TTL before the planned cutover if the DNS provider supports it.
5. Keep the old records and rollback values documented.
6. Change DNS only during a monitored window, then verify DNS, TLS, login, database writes, uploads, email, and critical workflows.
7. If a critical smoke test fails, restore the prior DNS record or promote the last known-good deployment according to [[Planning/Pages/Deployment]].

## 11. Recommended Working Session Order

1. Vince approves Render as the API provider and confirms access to GitHub, DNS, Vercel, Render, Neon, and Resend.
2. Vince rotates current credentials and keeps new values private.
3. Codex prepares the deployment-readiness code and tests it locally.
4. Vince performs provider sign-ins/MFA; Codex can guide each dashboard screen.
5. Create Neon staging, then Render staging API, then Vercel staging frontend.
6. Run the staging test matrix and restore drill.
7. Repeat for production, initially using provider-generated URLs.
8. Cut over DNS last.

## Official References

- [Vercel SvelteKit deployment](https://vercel.com/docs/frameworks/full-stack/sveltekit)
- [Vercel monorepo root directories](https://vercel.com/docs/monorepos)
- [Vercel custom domains](https://vercel.com/docs/domains/set-up-custom-domain)
- [Render web services](https://render.com/docs/web-services)
- [Render cron jobs](https://render.com/docs/cronjobs)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Prisma production migrations](https://docs.prisma.io/docs/cli/migrate/deploy)

[[Home]] | [[Context]] | [[Planning/Pages/Deployment]]
