---
date: 2026-07-27
tags: [decision]
status: Accepted
---

# ADR: Context.md owns current project truth

## Decision

Use root `Context.md` as the concise source of truth for current Oracle Inventory reality, focus, conflicts, and task-specific read-next routing.

Existing files keep narrower ownership: `Home.md` indexes files, `_Overview.md` owns detailed checkboxes, `PLAN.md` owns high-level remaining work, ADRs own rationale, page notes own specifications, journals own dated evidence, and code/deployments own implementation truth.

## Why

The vault had current decisions in `Home.md` and Deployment notes while `AGENTS.md` still described Hostinger and an older focus. A concise context layer gives Claude and Codex the same bootstrap without duplicating detailed tasks.

## Alternatives Considered

- Put all current status in `Home.md`: rejected because Home is primarily navigation and becomes noisy/stale.
- Treat `Planning/PLAN.md` as the only context: rejected because it mixes roadmap, architecture, status, and setup details.
- Keep context only in `AGENTS.md`: rejected because agent instructions and project reality change at different rates.

## Consequences

- Significant agents read `Home.md` then `Context.md` before planning or implementation.
- Context stays concise and links outward instead of copying detailed specs/checklists.
- Vault Scribe updates Context after an approved decision or verified implementation changes present reality.

[[Context]] | [[Home]] | [[Decisions/README]]
