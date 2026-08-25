---
date: 2026-06-28
tags: [decisions]
---

# Architecture Decision Records

This folder stores decisions made about the Oracle Inventory system — why something was chosen, what alternatives were considered, and whether it's still valid.

## Format

Each decision is a file named `YYYY-MM-DD-short-title.md` with this structure:

```
# ADR: [Title]
Date: YYYY-MM-DD
Status: Accepted | Superseded | Deprecated

## Decision
What was decided.

## Why
The reasoning.

## Alternatives Considered
What else was evaluated.

## Consequences
What this means going forward.
```

## Index

| File | Title | Status |
|------|-------|--------|
| [[2026-06-28-reports-merged-into-dashboard]] | Merge Reports Page into Dashboard | Accepted |
| [[2026-07-27-vercel-over-hostinger-deploy]] | Deploy to Vercel, not Hostinger | Accepted |
| [[2026-07-27-context-is-current-truth]] | Context.md owns current project truth | Accepted |
| [[2026-07-30-suspend-user-facing-scan-rollout]] | Suspend user-facing Scan System rollout | Accepted |
| [[2026-07-30-focused-commit-pr-workflow]] | Focused commit and pull request workflow | Accepted |
| [[2026-08-22-manual-primary-belarc-assisted-intake]] | Manual primary, Belarc-assisted inventory intake | Accepted for planning |

## Key Decisions Already Made (from memory)

- SvelteKit 5 + runes over Next.js — lighter, faster, no React overhead
- Tailwind v4 with `@theme` block — design tokens live in CSS, not config
- No component library — all components handwritten per DESIGN.md
- Prisma over raw SQL — schema-first, type-safe migrations
- JWT auth (single secret) — simple for single-admin V1, RBAC added in V2
- Branch model replaces Site model in V2 — more org-appropriate
- ~~Hostinger FTP deploy (legacy)~~ — superseded 2026-07-27, deploying to Vercel instead ([[2026-07-27-vercel-over-hostinger-deploy]])
- `Context.md` owns concise current truth and read-next routing; other vault files retain their narrower ownership ([[2026-07-27-context-is-current-truth]])
- User-facing Scan System rollout is suspended until a later owner decision reopens it; Belarc Hardware Audit remains active ([[2026-07-30-suspend-user-facing-scan-rollout]])
- Each feature, fix, vault documentation change, deployment change, migration, or other meaningful change must ship as its own focused commit and pull request ([[2026-07-30-focused-commit-pr-workflow]])
- Manual Mode is the official primary intake source for workbook-driven inventory expansion; Belarc is reviewed computer evidence only and must not silently overwrite official records ([[2026-08-22-manual-primary-belarc-assisted-intake]])
- Tesseract OCR for asset scanning — free, runs locally, no API cost
