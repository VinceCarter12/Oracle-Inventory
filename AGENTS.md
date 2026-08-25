# Codex — Oracle Inventory Vault

This is an **Obsidian vault** for the Oracle Inventory project. You are working inside a local folder that Obsidian visualizes. Read this file before doing anything.

## Session Start Checklist

**Do this automatically at the start of every session:**

1. Read `QUICK.md` — if there is any content below the comment line, tell the user "You have unsorted captures — run `/sort` to file them." Do not sort automatically; let the user trigger it.
2. Read `INBOX.md` — check for any raw ideas or tasks dumped since last session. If there are items, acknowledge them.
3. Read `Home.md` for the Vault Index.
4. Read `Context.md` for current truth, focus, conflicts, and task-specific Read Next routing.
5. Read the newest relevant `Journal/` entry for dated evidence.

---

## Environment

- **Vault root**: `C:\Users\vince\Downloads\Inventory v1`
- **Obsidian plugins active**: Terminal, Calendar, Excalidraw, Realclaudian
- **Code lives in**: `oracle-api/` (Express + Prisma backend) and `oracle-sv/` (SvelteKit frontend)
- **Do not touch**: `.obsidian/`, `node_modules/`, `oracle-api/`, `oracle-sv/` unless the user asks you to write code

---

## Vault Folder Structure

```
Inventory v1/
├── AGENTS.md               <- you are here
├── Home.md                 <- vault dashboard, always update links here
├── Context.md              <- current truth, focus, conflicts, read-next router
├── Planning/               <- roadmap, feature plans, open decisions
├── Design/                 <- design system, tokens, UI specs
├── Journal/                <- daily dev logs (YYYY-MM-DD.md)
├── Decisions/              <- architecture decision records (ADRs)
├── Notes/                  <- reference notes, API docs, tech snippets
├── Canvases/               <- .canvas files for system diagrams
├── Excalidraw/             <- .excalidraw.md drawings
├── oracle-api/             <- backend code (do not modify unless asked)
└── oracle-sv/              <- SvelteKit frontend code (do not modify unless asked)
```

---

## Find Before Edit — Required Rule

**Before creating or editing ANY note, always follow this sequence:**

1. Read `Home.md` and check the Vault Index section
2. If the note is listed → read that file first, then edit it
3. If the note is NOT listed → create it, then immediately add it to the correct section in `Home.md`'s Vault Index

**Never** create a note without adding it to `Home.md`.
**Never** edit a note without reading it first.
**Never** assume a file path — confirm it from the Vault Index.

> This keeps `Home.md` as the single source of truth. One check, always correct.

---

## Single Source of Truth — Status Tracking

| What | Where | Rule |
|------|-------|------|
| What files exist | `Home.md` Vault Index | Add every new note here immediately |
| Current project reality | `Context.md` | Keep concise; link to detail instead of duplicating it |
| Task status (`[ ]`/`[x]`) | `Planning/Pages/_Overview.md` | **Only file allowed to have checkboxes** |
| High-level remaining work | `Planning/PLAN.md` §9 | Update when a phase ships |
| Why a decision was made | `Decisions/` ADRs | One file per decision |
| What was built when | `Journal/YYYY-MM-DD.md` | One entry per session |
| Page specs / wireframes | `Planning/Pages/*.md` | Spec content only — **no checkboxes** |

**Never** add `[ ]` or `[x]` checkboxes to any `Planning/Pages/*.md` file except `_Overview.md`.
**Never** duplicate status between `_Overview.md` and `PLAN.md` — `_Overview` is detailed, `PLAN.md §9` is high-level summary only.

---

## Note-Writing Rules

1. **Always use frontmatter** on every note:
   ```yaml
   ---
   date: YYYY-MM-DD
   tags: [journal | planning | decision | note | design]
   ---
   ```
2. **Use backlinks** — link to related notes with `[[Note Name]]`. Never leave a note isolated.
3. **Journal entries** go in `Journal/YYYY-MM-DD.md`. One file per day. Append to existing file if it already exists.
4. **Decision records** go in `Decisions/` with format `YYYY-MM-DD-short-title.md`.
5. **Link new journal entries from `Home.md`** under the Recent Sessions section.
6. **Keep Planning/PLAN.md up to date** — when a feature is confirmed built, mark it `[x]` and update the Current State Summary table.

---

## Recovering Lost Session History

When the user says "what did we build?" or "catch me up", run:
```bash
git log --oneline -20
git show <commit-hash> --stat
```
Then write a journal entry summarizing what was built, and update Planning/PLAN.md if the status of any feature changed.

---

## Agent Pipeline

Inventory mirrors the Sales App pipeline and preset model/effort assignments in `.codex/agents/`; Claude role mirrors live in `.claude/agents/`:

0. `context-contract-gate` - `gpt-5.6-luna`, low
1. `intake-analyst` - `gpt-5.5`, low
2. `system-analyst` - `gpt-5.6-luna`, low
3. `enterprise-ux-design-auditor` - `gpt-5.6-sol`, medium; on-demand before architecture review for user-facing pages, flows, routing, content, design-system, or accessibility work
4. `architecture-reviewer` - `gpt-5.6-sol`, medium
5. `vault-scribe` - `gpt-5.5`, low
6. `inventory-engineer` - `gpt-5.6-luna`, medium
7. `quality-gate` - `gpt-5.6-luna`, medium
8. `architecture-auditor` - `gpt-5.6-sol`, low by default; use medium for broad/high-risk audits

The context gate runs first for significant feature, schema, security, import, integration, release, or user-facing UX batches. Run the enterprise UX/design auditor before architecture review when a change affects pages, flows, navigation, user-facing content, visual design, or accessibility. It is read-only and creates a redesign or wireframe only when the user explicitly asks. Human approval is required after architecture review and before vault/code/provider changes. The architecture auditor is on-demand. Trivial self-contained tasks may skip the pipeline.

---

## Current Focus

> Update this section manually or ask Codex to update it after each session.

**Last worked on**: 2026-07-27
**Status**: Vercel accepted for `oracle-sv`; Inventory Context and Sales App-style agent presets established; API/database/DNS deployment remains planned.
**Next priority**: Approve and execute the staged Vercel + Render + Neon deployment foundation, including security and migration gates — see `Context.md` and `Planning/Pages/Deployment.md`.

---

## Project Context

- **Product**: Oracle Inventory — asset tracking system for Sir Jay's org (Manila, Cebu, Davao)
- **Design system**: Vercel-inspired, documented in `Design/DESIGN.md`
- **Auth**: JWT, single admin user currently (V2 adds multi-user RBAC + OTP)
- **Deploy target**: Vercel for `oracle-sv` (accepted); Render recommended for `oracle-api` (not yet accepted); Neon PostgreSQL
- **Live domain**: `oracleinventory.lubesmastery.com` remains legacy until the new deployment is production-verified
