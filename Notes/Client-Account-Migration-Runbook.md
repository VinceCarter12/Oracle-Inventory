---
date: 2026-07-29
tags: [note, deployment, supabase, vercel, handoff]
---

# Client Account Migration Runbook

> Repeatable handoff for moving Oracle Inventory from development accounts to client-owned Supabase and Vercel accounts. It captures the deployment lessons from the 2026-07-28 to 2026-07-29 setup session. No credentials belong in this note.

## Target ownership

| Service | Client-owned purpose | Keep out of source control |
|---|---|---|
| Vercel | Frontend and API projects, domains, environment variables, deployment history | database URLs, JWT secret, Resend key |
| Supabase | PostgreSQL project, migration history, backups, connection strings | database password and connection strings |
| Resend | Sending domain, DNS verification, API key | API key |
| GitHub | Repository and production deployment trigger | secrets and `.env` files |

## Before moving anything

1. Create the client-owned Vercel team and Supabase project. Give the client owner access first; grant the delivery team the least access needed.
2. Record the client project reference, Vercel project IDs, production domain, region, and the person responsible for backups and DNS in a private handoff record.
3. Use a fresh strong database password and a new JWT secret. Do not reuse development secrets.
4. Copy the repository to the client GitHub organization or transfer ownership only after the client confirms the target organization and access list.
5. Do not paste passwords, connection strings, Resend API keys, or generated user passwords into the vault, Git history, screenshots, tickets, or chat.

## Supabase migration procedure

1. In the client Supabase project, choose the intended region before creating data. For Philippine users, a nearby Asia region is normally appropriate; confirm against the client data-residency requirement.
2. Obtain the **transaction pooler** connection string for the API runtime and save it in Vercel as `DATABASE_URL`.
3. Keep a direct/session connection only for controlled migration tooling if it is genuinely needed. The running API uses `DATABASE_URL`; do not add `DIRECT_URL` merely because a dashboard example shows it.
4. Apply the versioned baseline SQL migration and role/permission seed in order:
   - `20260729131539_init_oracle_inventory_baseline`
   - `20260729131623_seed_inventory_roles_permissions`
5. Verify migration history and expected tables before deploying the API. Confirm RLS is enabled and that there are no public policies unless the architecture explicitly calls for Supabase Data API access.
6. Create temporary role-test users only after the API can reach the client database. Set `mustChangePassword` for all bootstrap users. Give credentials through a secure channel, never this vault.
7. Take and test a restore procedure before real imports. Migration success is not backup/restore proof.

## Vercel deployment procedure

### 1. Create two projects

- **Frontend project:** root directory `oracle-sv`.
- **API project:** root directory `oracle-api`.

Both projects must use Node 20. Node 24 caused an adapter build failure and must not be selected unless the Svelte adapter explicitly supports it.

### 2. Configure API environment variables

Set these in the API project for **Production** (and Preview only when intentionally testing there):

| Variable | Required value rule |
|---|---|
| `DATABASE_URL` | Client Supabase transaction-pooler URL; URL-encode reserved characters in the password |
| `JWT_SECRET` | New long random secret, unique to the client |
| `NODE_ENV` | `production` |
| `APP_URL` | Exact stable frontend production URL, including `https://` |
| `CORS_ALLOWED_ORIGINS` | Exact stable frontend production URL, including `https://` |
| `RESEND_API_KEY` | Client Resend key, only after the sending domain is verified |
| `EMAIL_FROM` | Verified client sending address |
| `MAINTENANCE_SCHEDULER_ENABLED` | `false` until the scheduled-job design is approved |

If a password contains characters such as `@`, `:`, `/`, `?`, `#`, `%`, `!`, or `$`, encode it when it appears inside a connection URL. Use the pooler string provided by Supabase; do not manually combine a direct hostname with a pooler port.

### 3. Configure frontend-to-API routing

The frontend uses a Vercel rewrite so browser calls to `/api/*` go to the API project. Keep the current route contract in [`oracle-sv/vercel.json`](../oracle-sv/vercel.json):

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<client-api-domain>/gateway/:path*"
    }
  ]
}
```

The API must mount the same route modules at `/gateway` as well as `/api`. This avoids the nested serverless route handling issue that previously returned `Cannot GET /api/health` or `NOT_FOUND` for nested auth paths.

### 4. Attach domains

1. Add the client domain from the Vercel **project** that will serve it, or use the account-level **Connect External** action if it is not yet in the team.
2. Connect it to **Production**.
3. Enter Vercel exact DNS records at the DNS provider. Vercel hosts the app; it is not automatically the DNS provider.
4. Use one stable frontend URL for `APP_URL` and `CORS_ALLOWED_ORIGINS`. Do not use a temporary immutable deployment URL as the production origin.

## Required verification order

Do this after each client migration, in this exact order:

1. API stable URL: `/health` returns `{ "status": "ok" }`.
2. API stable URL: `/ready` returns `{ "status": "ready" }`. `not_ready` means the API cannot complete its database readiness check.
3. Frontend stable URL: open `/login` from the stable project domain, not an old immutable deployment URL.
4. Submit one temporary account and inspect the API runtime logs for `POST /gateway/auth/login`.
5. Confirm forced password change, then log in again with the new password.
6. Run allow/deny role checks for super admin, admin, and other required roles.
7. Smoke-test CORS, email, import, upload, and audit flows before DNS cutover.
8. Record the deployed commit, stable frontend/API domains, result of each test, and rollback owner in a dated journal entry.

## Incident lessons from this setup

| Symptom | Actual cause or lesson | Correct response |
|---|---|---|
| Svelte build rejects Node 24 | Current adapter accepts Node 18/20 only | Pin Node 20 and redeploy |
| Vercel says `FUNCTION_INVOCATION_FAILED` | Runtime initialization/config failure, not necessarily frontend failure | Inspect function logs before changing code |
| `/api/health` says `Cannot GET` | Health route was `/health`, not `/api/health` | Test the actual API route contract |
| Nested `/api/auth/login` returns Vercel `NOT_FOUND` | Serverless nested route handling/proxy mismatch | Use the `/gateway` API mount plus frontend rewrite |
| Login shows generic incorrect-credentials error | An old frontend deployment can turn HTML routing failure into a generic client error | Test the stable domain and confirm a POST appears in API logs before resetting users |
| `ready` is `not_ready` | Runtime database connection/config has not passed readiness | Check `DATABASE_URL`, URL encoding, project environment scope, then redeploy |
| Direct Git push is rejected as non-fast-forward | Local copy is behind remote main | Fetch/rebase or use a clean worktree; never force-push over client history |
| Supabase SQL checks fail on `_prisma_migrations` | Supabase migration history is authoritative in this setup, not Prisma table history | Verify Supabase migration history; do not mix migration owners without a reconciliation plan |

## Cutover and rollback

- Keep the old production target available until the client project passes the full verification order.
- Do not change public DNS until the client approves the maintenance/rollback window.
- Before cutover, capture database restore evidence and the previously working Vercel deployment identifiers.
- If the new environment fails after DNS cutover, revert the domain alias/DNS to the last verified target, preserve logs, and stop imports or destructive writes until the cause is known.

## Handoff record template

Store this in the client approved private system, not this vault:

| Item | Record |
|---|---|
| Client owner | |
| Supabase project reference and region | |
| Vercel frontend project | |
| Vercel API project | |
| Stable frontend domain | |
| Stable API domain | |
| DNS provider and owner | |
| Backup/restore owner and last test date | |
| Deployment commit and date | |
| Role-test evidence location | |
| Rollback owner and method | |

[[Home]] | [[Context]] | [[Planning/Pages/Deployment]] | [[Journal/2026-07-29]]
