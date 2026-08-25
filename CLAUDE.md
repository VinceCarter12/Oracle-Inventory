# Claude — Oracle Inventory Vault

This is an **Obsidian vault** for the Oracle Inventory project. You are working inside a local folder that Obsidian visualizes. Read this file before doing anything.

## Session Start Checklist

**Do this automatically at the start of every session:**

1. Read `QUICK.md` — if there is any content below the comment line, tell the user "You have unsorted captures — run `/sort` to file them." Do not sort automatically; let the user trigger it.
2. Read `INBOX.md` — check for any raw ideas or tasks dumped since last session. If there are items, acknowledge them.
3. Read `Journal/` — find the most recent entry to understand where things were left off.
4. Note the current focus from the `## Current Focus` section below.

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
├── CLAUDE.md               <- you are here
├── Home.md                 <- vault dashboard, always update links here
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

## Current Focus

> Update this section manually or ask Claude to update it after each session.

**Last worked on**: 2026-07-06
**Status**: Hardware Audit COMPLETE — all phases A–E. Activity Log page verified already fully wired (was mistakenly tracked as pending — docs never caught up to the actual build); Phase 8 now COMPLETE.
**Next priority**: Deployment to Vercel (install `adapter-vercel`, decide `oracle-api` hosting + domain, High) or wire `/scan/mobile` + `/scan/review` UI (Medium) — see PLAN.md §9

---

## Project Context

- **Product**: Oracle Inventory — asset tracking system for Sir Jay's org (Manila, Cebu, Davao)
- **Design system**: Vercel-inspired, documented in `Design/DESIGN.md`
- **Auth**: JWT, single admin user currently (V2 adds multi-user RBAC + OTP)
- **Deploy target**: Vercel (`adapter-vercel`) — decided 2026-07-27, Hostinger dropped, see [[Decisions/2026-07-27-vercel-over-hostinger-deploy]]
- **Live domain**: `oracleinventory.lubesmastery.com`
