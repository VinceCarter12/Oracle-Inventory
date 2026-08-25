---
date: 2026-07-30
tags: [decision]
---

# ADR: Focused commit and pull request workflow
Date: 2026-07-30
Status: Accepted

## Decision

Each feature, fix, vault documentation change, deployment change, migration, or other meaningful change must be delivered as its own focused commit and its own pull request.

## Why

Oracle Inventory has active app, vault, deployment, Supabase, and security work moving at the same time. Focused commits and pull requests keep review scope small, make rollback safer, preserve clear dated evidence, and prevent unrelated planning, code, migration, and provider changes from being approved as one bundle.

## Alternatives Considered

- Batch multiple unrelated changes into one pull request. Rejected because it makes review, rollback, and release evidence harder to trust.
- Commit only after a full phase is complete. Rejected because phase-sized diffs hide individual decisions and create unnecessary merge risk.
- Use informal worktree snapshots without pull requests. Rejected because production and security work need explicit review boundaries.

## Consequences

- Agents and humans should split work before implementation when a request crosses feature or risk boundaries.
- Vault-only documentation updates, app code changes, migrations, provider configuration, and release verification should not share one pull request unless they are inseparable for one approved change.
- Journal evidence should identify the focused decision or change being recorded, not imply that a broader batch shipped.

[[Home]] | [[Context]] | [[Decisions/README]]
