# 🚀 The Beginner's Study Guide to Agentic Engineering with Claude Code
**For developers using Next.js 16, React 19, TypeScript 5, Tailwind v4, Base UI + shadcn v4, Prisma 7, and PostgreSQL**

*Last updated: May 2026 · Designed for beginners · Read top-to-bottom or jump to sections*

---

## ✅ Quick-Start Checklist (Do These First)

Before you read the rest of this guide, here is the 30-minute setup that will already put you ahead of 80% of Claude Code users:

1. **Install Claude Code** in your terminal: `curl -fsSL https://claude.ai/install.sh | bash` (macOS/Linux) or `irm https://claude.ai/install.ps1 | iex` (Windows PowerShell). Verify with `claude --version`.
2. **Log in** with a paid Claude account (Pro $20/mo minimum; Max is better if you use it daily).
3. **Open your project folder** in the terminal and type `claude` to launch.
4. **Run `/init`** — this auto-generates a starter `CLAUDE.md` file.
5. **Edit `CLAUDE.md`** down to under 200 lines, listing your stack, folder map, commands, and rules.
6. **Create `.claude/` folder** with sub-folders: `agents/`, `skills/`, `commands/`.
7. **Add 2 MCP servers** to start: `context7` (live docs) and `postgres` (read-only DB access).
8. **Always use Plan Mode** (Shift+Tab twice) for any task with 3+ steps.
9. **Run `/clear` between unrelated tasks** to keep context clean.
10. **Commit `.claude/` and `CLAUDE.md` to git** so your whole team (and future you) gets the same setup.

If you do nothing else from this guide, do those ten steps. The rest of this document explains *why* and *how to go deeper*.

---

## 📚 Table of Contents

1. **Roadmap: Beginner → Agentic Pro**
2. **Project Structure for AI Agents**
3. **How to Use Claude Code Properly**
4. **Skills: The Complete Guide**
5. **MCP Servers by Situation**
6. **Tips, Tricks & Trends from 2026 Practitioners**
7. **Prompt Analysis (/prompt-master)**
8. **Cheat Sheet**

---

# 1. 🛣️ ROADMAP: How to Become an Agentic / Vibe-Code Pro

## 1.1 Two Modes of AI Coding — Define Them Clearly

Andrej Karpathy (who *coined* "vibe coding") drew a sharp line in early 2026 between two distinct disciplines. Both are legitimate; they just serve different goals.

| | **Vibe Coding** 🌊 | **Agentic Engineering** 🛠️ |
|---|---|---|
| **Goal** | "Can I make this work?" | "Can I make this work reliably, at scale, securely?" |
| **Audience** | Beginners, hobbyists, prototypers | Professional developers, production code |
| **Approach** | Talk to AI in natural language, accept what it generates, iterate on vibes | Plan → Spec → Execute → Verify → Ship, with the human as oversight at every gate |
| **What gets reviewed** | The final result (does it work?) | The plan, the diff, the tests, the architecture |
| **Karpathy's metaphor** | "Raises the floor" — anyone can now build | "Preserves the ceiling" — professional-grade quality bar |
| **Risk** | Hidden bugs, security holes, tech debt that crushes the project at month 3 | Slower upfront, but you actually ship and maintain it |

**Concrete example — same task, two modes:**

- **Vibe-coded version of "add login":** *"Claude, add login to my app."* → You get something. You don't know if passwords are hashed correctly. You don't know if there's a session fixation vulnerability. It works on your machine. You ship it. Pray.
- **Agentic-engineered version:** *"Read CLAUDE.md and prisma/schema.prisma. Then write a spec at docs/specs/auth.md covering: NextAuth v5 with Credentials provider, bcrypt password hashing (rounds=12), JWT session strategy, rate-limiting on /api/auth, tests for the happy path and 3 failure modes. Ask me clarifying questions before writing any code."* → You get a reviewed plan first. You approve it. Claude executes. You verify with tests.

> 💡 **Andrej Karpathy himself**: *"Agentic engineering is an engineering discipline. You have these agents which are spiky, stochastic entities — but extremely powerful. How do you coordinate them to go faster without sacrificing your quality bar?"*

## 1.2 Why Agentic Engineering Matters in 2026

A few hard numbers from this year:

- As of February 2026, **~4% of all public GitHub commits (≈135,000/day)** are authored by Claude Code.
- **90% of Anthropic's own code is AI-written.**
- Anthropic's 2026 developer report shows devs **use AI in ~60% of work, but only fully delegate 0–20% of tasks** — the rest is human-supervised.
- Teams using structured agentic workflows report **67% more PRs merged per day**.
- SonarSource's 2026 benchmark: Opus 4.5 Thinking solves 83.6% of real engineering tasks — but the unsolved 16% is exactly the conceptually-subtle bugs a human review catches.

**Translation for you:** The AI is capable enough that you cannot afford to ignore it. It is also unreliable enough that you cannot afford to trust it blindly. The discipline of *agentic engineering* is the bridge.

## 1.3 The Beginner → Pro Learning Roadmap

Follow these milestones in order. Each one builds on the previous.

### 🟢 Stage 1 — "Talking to the Agent" (Week 1)
- Install Claude Code, log in, get comfortable with the terminal interface.
- Build one tiny project (a todo app in Next.js + Prisma) using only natural-language prompts.
- Learn the 4 most useful slash commands: `/clear`, `/compact`, `/init`, `/help`.
- **Goal:** Stop being afraid of the terminal. Get a feel for how the AI behaves.

### 🟡 Stage 2 — "Project Memory" (Week 2)
- Write your first `CLAUDE.md`. Put your stack, folder map, commands, and 5 "do/don't" rules.
- Try Plan Mode (Shift+Tab twice) before letting Claude write code.
- Learn `@filename` to point Claude at specific files instead of letting it search blindly.
- **Goal:** Stop repeating yourself. The project remembers conventions.

### 🟠 Stage 3 — "Specs and Plans" (Weeks 3–4)
- For every feature, write a short markdown spec (`docs/specs/feature-x.md`) *before* coding.
- Adopt the **Research → Plan → Execute → Review → Ship** loop.
- Start using `/compact` proactively when context fills up.
- **Goal:** Stop fighting context drift. The AI stays on track across long sessions.

### 🔵 Stage 4 — "Extending the Agent" (Month 2)
- Install 3–5 MCP servers (start with Context7, Postgres, GitHub).
- Write your first custom slash command in `.claude/commands/`.
- Write your first Skill in `.claude/skills/` (something you do more than once a week, like "generate a new App Router page").
- **Goal:** Stop typing the same setup prompts. The agent gains tools and reusable workflows.

### 🟣 Stage 5 — "Orchestration" (Month 3+)
- Create custom subagents in `.claude/agents/` (code-reviewer, security-reviewer, test-writer).
- Add hooks in `.claude/settings.json` for deterministic enforcement (auto-format, lint, block dangerous commands).
- Use git worktrees + parallel Claude sessions for multi-feature development.
- **Goal:** You are now orchestrating a small AI team. You're shipping production code in days, not weeks.

### ⚫ Stage 6 — "Compound Engineering" (Ongoing)
- Every time Claude makes a mistake → add a rule to CLAUDE.md or a hook. Boris Cherny (creator of Claude Code) calls this **compound engineering** — your config grows wiser with every bug.
- Share Skills/commands with your team. Treat `.claude/` as first-class code that is reviewed in PRs.

## 1.4 Mindset Shifts You Must Make

The hardest part isn't learning commands — it's changing how you think.

| Old Mindset (writing code yourself) | New Mindset (directing an agent) |
|---|---|
| "I write every line." | "I write specs, decide the architecture, and verify outputs." |
| "I memorize syntax." | "I memorize *patterns* and let Claude recall syntax." |
| "Bug? I debug for hours." | "Bug? I spin up a fresh subagent in a clean context to investigate." |
| "I read the code Claude wrote." | "I read the **plan** Claude wrote, *then* approve code." |
| "Tests are something I add later." | "Tests are the verification layer that lets me trust the agent." |
| "My job is typing." | "My job is judgment, taste, and oversight." |

> 🧠 **Karpathy on this shift:** *"You can outsource syntax recall and implementation details to agents, but you cannot outsource architectural understanding or the ability to catch subtle logical errors."*

## 1.5 The Top 7 Beginner Mistakes (and How to Avoid Them)

1. **Vague prompts.** *"Fix the bug"* → useless. *"Fix the login bug where users see a blank screen at `/auth` after entering wrong credentials. Logs are in `logs/server.log`. The relevant file is `src/app/(auth)/auth/page.tsx`."* → useful.
2. **No CLAUDE.md.** Every session, Claude starts blind. Fix: write one.
3. **Skipping Plan Mode.** You let Claude refactor 12 files at once, it half-works, you spend 2 hours undoing it. Fix: Plan Mode for any task with 3+ steps.
4. **Never running `/clear`.** Old context bleeds into new tasks, the AI gets confused, costs balloon. Fix: clear between unrelated tasks.
5. **Trusting the diff without reading it.** Especially for auth, payments, and data mutations — *always* read these yourself.
6. **Hoarding context.** Cramming the entire codebase into one prompt makes Claude *worse*, not better. Less context, more relevant context = better results.
7. **Treating the agent as autonomous.** Anthropic's own 2026 report: full delegation works for 0–20% of tasks. The other 80% needs human review checkpoints.

---

# 2. 🏗️ PROJECT STRUCTURE for AI Agents

## 2.1 Why Structure Matters (the analogy)

Imagine hiring a new junior engineer on day one. You hand them a folder with random files, no README, no folder logic, no documented conventions, and you say "make me a login page."

That's what 80% of devs do to Claude Code every session.

**A well-structured project gives Claude three things:**
1. **Context** — it knows what your project is and what stack it uses.
2. **Predictability** — it knows *where* to put new code so it matches existing patterns.
3. **Modularity** — each folder has one job, so Claude can read just what it needs (saving tokens and reducing confusion).

## 2.2 Recommended Folder Structure (your exact stack)

Here is a battle-tested structure for **Next.js 16 + React 19 + TS 5 + Tailwind v4 + Base UI / shadcn v4 + Prisma 7 + PostgreSQL**:

```
my-app/
├── CLAUDE.md                    # ⭐ Claude's project memory (loaded every session)
├── AGENTS.md                    # Same content, for tool-agnostic agents (Cursor, etc.)
├── README.md                    # Human-facing project intro
├── .claude/
│   ├── settings.json            # Permissions, hooks, allowed tools (commit to git)
│   ├── settings.local.json      # Personal overrides (gitignored)
│   ├── rules/                   # Path-scoped instructions
│   │   ├── api-rules.md
│   │   ├── prisma-rules.md
│   │   └── components-rules.md
│   ├── skills/                  # Reusable workflows (more on this in §4)
│   │   └── create-route/SKILL.md
│   ├── agents/                  # Custom subagents (more in §3)
│   │   ├── code-reviewer.md
│   │   └── prisma-migrator.md
│   ├── commands/                # Custom slash commands
│   │   └── review-pr.md
│   └── .mcp.json                # MCP server configs (commit, but no secrets!)
├── .claudeignore                # Files to hide from Claude (like .gitignore)
├── docs/
│   ├── ARCHITECTURE.md          # High-level architecture diagram + decisions
│   ├── specs/                   # One markdown file per feature spec
│   │   ├── auth.md
│   │   └── checkout.md
│   └── adr/                     # Architecture Decision Records (optional)
├── prisma/
│   ├── schema.prisma            # Database models
│   ├── migrations/              # Versioned migrations
│   └── seed.ts
├── prisma.config.ts             # Prisma 7 requires this (new in v7!)
├── src/
│   ├── app/                     # Next.js 16 App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/              # Route groups
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── api/                 # API route handlers
│   │   │   └── auth/[...nextauth]/route.ts
│   │   └── generated/prisma/    # Prisma 7 generated client (gitignored)
│   ├── components/
│   │   ├── ui/                  # shadcn v4 / Base UI primitives
│   │   └── features/            # Feature-specific components
│   ├── lib/
│   │   ├── db.ts                # Prisma singleton (Prisma 7 pattern)
│   │   ├── auth.ts
│   │   └── utils.ts
│   ├── hooks/
│   ├── types/
│   └── styles/
│       └── globals.css          # Tailwind v4 imports
├── tests/
│   ├── unit/
│   └── e2e/
├── public/
├── .env                         # Local secrets (NEVER COMMIT)
├── .env.example                 # Template (commit this)
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts
```

### Why these specific folders?

- **`src/` directory:** Recommended by Next.js team and Claude Code prefers it because it disambiguates "app code" from config files at the root.
- **`app/generated/prisma/`** for Prisma 7's client output: Prisma 7 made driver adapters mandatory and the generated client now lives wherever you point it. Putting it inside `app/` plays nicely with Next.js 16's Turbopack.
- **`prisma.config.ts`** (root): **New in Prisma 7** — the database URL is no longer in `schema.prisma`; it lives here. Don't skip this.
- **`docs/specs/`:** This is the spec-driven development home — every feature gets a spec before code.
- **`.claude/rules/`:** Path-scoped rules (e.g., "rules that only apply when working in `src/app/api/`"). Keeps your main CLAUDE.md skinny.

## 2.3 CLAUDE.md — The Single Most Important File

**The community consensus in 2026 is unanimous: CLAUDE.md is no longer optional. It is as important as `.gitignore`.**

### What is it?
A Markdown file at your project root that Claude Code **automatically loads at the start of every session**. Think of it as the onboarding doc you'd give a new junior engineer.

### The Five Questions It Must Answer
1. **What is this?** — One paragraph: project purpose, who it's for.
2. **What's the stack?** — Languages, frameworks, major dependencies (with versions).
3. **Where do things live?** — A simple directory map with one-line descriptions.
4. **How do I run it?** — Build, test, lint, dev-server commands.
5. **What are the rules?** — Coding conventions, naming, things to never do.

### The 200-Line Rule
Anthropic and Boris Cherny (Claude Code's creator) recommend keeping CLAUDE.md **under 200 lines, ~150 instructions max**. Bloated files cause Claude to *ignore* actual instructions — counterintuitive but documented. Use `@imports` to reference longer details in separate files.

### Example CLAUDE.md (your stack)

```markdown
# MyApp — Project Memory for Claude

## What this is
A subscription-based learning platform. Production app, security and 
data integrity matter more than speed.

## Stack
- **Language:** TypeScript 5 (strict mode, no `any`)
- **Framework:** Next.js 16.2.6 (App Router only, NOT Pages Router)
- **UI:** React 19.2.4, Tailwind CSS v4, Base UI (@base-ui/react), shadcn v4
- **ORM:** Prisma 7 with driver adapter (@prisma/adapter-pg + pg)
- **Database:** PostgreSQL (local in dev, Neon in prod)
- **Package manager:** pnpm
- **Tests:** Vitest (unit) + Playwright (e2e)

## Architecture
- App Router with Server Components by default; add `'use client'` only when you need useState, useEffect, useRef, or browser event handlers.
- Database access ONLY through `@/lib/db.ts` (the Prisma singleton). Never instantiate PrismaClient directly elsewhere.
- All API routes use `route.ts` in `app/api/`. No `pages/api/`.

## Directory Map
- `src/app/` — Next.js App Router pages, layouts, API routes
- `src/components/ui/` — shadcn v4 + Base UI primitives (auto-generated, do not hand-edit)
- `src/components/features/` — Feature-specific components
- `src/lib/` — Shared helpers (db, auth, utils)
- `prisma/schema.prisma` — Database schema
- `prisma.config.ts` — Prisma 7 config (datasource URL lives HERE, not in schema)
- `docs/specs/` — Feature specs (read these BEFORE implementing)

## Commands
- `pnpm dev` — Start dev server (Turbopack on port 3000)
- `pnpm build` — Production build
- `pnpm test` — Run Vitest
- `pnpm test:e2e` — Run Playwright
- `pnpm lint` — ESLint check
- `pnpm db:push` — Push Prisma schema to DB (dev)
- `pnpm db:migrate` — Create a new migration
- `pnpm db:studio` — Open Prisma Studio

## Code Style
- Named exports, NOT default exports (except Next.js page/layout files which must default-export)
- Arrow functions for components
- Path aliases: always `@/components/...`, never `../../components/...`
- Tailwind utility classes only — no custom CSS files except `globals.css`
- Use `cn()` from `@/lib/utils` for conditional classes

## Rules (Important!)
- NEVER commit `.env` or any file containing secrets.
- NEVER edit `src/app/generated/prisma/` (auto-generated).
- NEVER use `any` in TypeScript — use `unknown` and narrow, or define a type.
- ALWAYS run `pnpm lint && pnpm test` before declaring a task complete.
- ALWAYS read `docs/specs/<feature>.md` before implementing that feature.
- For Prisma: instantiate ONCE in `src/lib/db.ts` using the singleton pattern. Hot reload will explode otherwise.

## When uncertain
- If you don't know the current Next.js 16 or Prisma 7 API, use the Context7 MCP server to fetch live docs. Do not guess — your training data may be stale.
- If a task touches auth, payments, or data deletion: STOP and ask for confirmation before writing code.

## Imports (referenced files)
- @docs/ARCHITECTURE.md
- @.claude/rules/api-rules.md
- @.claude/rules/prisma-rules.md
```

### Nested CLAUDE.md Files
You can also place a smaller `CLAUDE.md` inside specific subfolders (e.g., `src/app/api/CLAUDE.md`) with rules specific to that area. Claude loads them when working in that directory. Great for big projects.

## 2.4 README.md vs ARCHITECTURE.md vs CLAUDE.md

| File | Audience | Content |
|---|---|---|
| `README.md` | Humans (new contributors) | What the project is, how to install, how to contribute |
| `ARCHITECTURE.md` | Humans + AI | High-level diagrams, why decisions were made, system boundaries |
| `CLAUDE.md` | AI agents | Stack, rules, commands, conventions — concise and scannable |
| `docs/specs/*.md` | AI agents (per task) | Detailed spec of a single feature before it's built |

## 2.5 Naming Conventions & Separation of Concerns

Standardize on **one** of each and tell Claude in CLAUDE.md:
- **Files:** kebab-case (`user-profile.tsx`) OR PascalCase for components (`UserProfile.tsx`) — pick one
- **Folders:** kebab-case always
- **Components:** PascalCase
- **Functions/variables:** camelCase
- **Constants:** SCREAMING_SNAKE_CASE
- **Types/interfaces:** PascalCase, no `I` prefix

Separation of concerns:
- **`app/`** = routing, layouts, pages (thin — just compose)
- **`components/`** = UI only, no data fetching
- **`lib/`** = pure logic, data access, utilities
- **`prisma/`** = schema & migrations only

## 2.6 Environment Variables & Secrets — Safely With AI Agents

**Golden rules:**
1. **Never put real secrets in any file Claude can read.** Use `.env`, gitignored, and create `.env.example` with placeholder keys.
2. **Add a `.claudeignore`** that excludes `.env*`, `*.pem`, `secrets/`, etc.
3. **In `.mcp.json`** (which IS committed to git for your team), reference env vars from your shell, never inline the secret:
   ```json
   {
     "mcpServers": {
       "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}" }
       }
     }
   }
   ```
4. **Use hooks** to scan diffs for accidentally-committed secrets before Claude commits.
5. **Permission rules** in `.claude/settings.json` can deny reads of specific paths:
   ```json
   { "permissions": { "deny": ["Read(/path/to/.env*)"] } }
   ```

---

# 3. 💻 HOW TO USE CLAUDE CODE PROPERLY

## 3.1 Installation & Setup

### macOS / Linux
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

### Windows (native PowerShell)
```powershell
irm https://claude.ai/install.ps1 | iex
```

### Node.js fallback (any OS, requires Node 18+)
```bash
npm install -g @anthropic-ai/claude-code
```

**Don't use `sudo npm install -g`** — fix npm's prefix or use `nvm` instead. After install, open a new terminal and run `claude --version` to verify.

### First login
```bash
cd ~/your-project
claude
```
A browser opens for OAuth. You need a paid plan: **Claude Pro ($20/mo)** is fine to start; **Max ($100–200/mo)** if you use it for hours daily. Free tier does NOT include Claude Code.

### Authentication options
- **Pro/Max subscription** (recommended for most): fixed monthly cost, generous limits.
- **API key** (for CI/CD): set `ANTHROPIC_API_KEY` env variable. Pay-per-use.
- **Bedrock/Vertex AI** for enterprise: set `CLAUDE_CODE_USE_BEDROCK=1`.

## 3.2 Essential Commands & Workflows

### Starting a session
```bash
claude                                # Interactive mode in current folder
claude "refactor the auth module"      # Start with an initial prompt
claude -p "explain this codebase"      # Print mode — one-shot, exits after
claude -c                              # Continue most recent session
claude -r "session-name"               # Resume a named session
claude -w feature-auth                  # Start in isolated git worktree
```

### Built-in slash commands (use these every day)

| Command | What it does | When to use |
|---|---|---|
| `/init` | Auto-generates a starter CLAUDE.md | First thing in a new project |
| `/clear` | Wipes conversation context | Every time you switch tasks |
| `/compact` | Summarizes history into a dense summary | When context hits ~80% |
| `/resume` | Pick a previous session | Coming back to in-progress work |
| `/model` | Switch model (Opus/Sonnet/Haiku) | Tough problem → Opus; routine → Sonnet |
| `/cost` | Shows token spend so far | Check before long sessions |
| `/context` | Shows context window usage | When wondering "am I full yet?" |
| `/help` | List all commands | When you forget |
| `/review` | Code review the recent changes | Before committing |
| `/install-github-app` | Add Claude as PR reviewer on GitHub | Once per repo |
| `/hooks` | Interactive hook config | Setting up automation |
| `/agents` | View available subagents | Managing your AI team |

### The Plan Mode workflow (USE IT)

Plan Mode is the **single highest-leverage feature** of Claude Code.

**How:** Press `Shift+Tab` twice (or click the indicator at the bottom).

**What happens:** Claude can read files and think, but **cannot write/edit anything** until you approve a plan.

**When to use it:**
- Any task with 3+ steps
- Anything touching auth, payments, or data deletion
- Anything that spans multiple files
- When you're not 100% sure what you want

**Workflow:**
1. Enter Plan Mode.
2. Describe what you want (with context — see prompts below).
3. Claude produces a plan: which files, which functions, what order.
4. You review it, ask for changes, iterate.
5. Approve → Claude executes.

> 💡 *"Plan Mode is the unsexy, mechanical feature that makes everything else more reliable. It is a gate, not magic. The teams shipping the cleanest PRs in 2026 are not the ones with the cleverest prompts; they are the ones who treat planning as a first-class step."*

### Auto-edit vs. Accept/Reject Modes

Press `Shift+Tab` to cycle through:
- **Manual** (default): Claude asks before every file edit. Slow but safest. Use for unfamiliar code.
- **Auto-edit**: Claude edits freely; you can hit Esc to interrupt. Use for routine work in well-structured projects.
- **Plan Mode**: Read-only until plan is approved.

Many practitioners run `claude --dangerously-skip-permissions` after Plan Mode is set up — risky-sounding but commonly used. Use only inside git worktrees so a rogue agent can't trash your main branch.

## 3.3 How to Write Effective Prompts

The "junior engineer" mental model again: would a junior do good work with this prompt?

### The 5 Ingredients of a Great Prompt

1. **Context** — what's the project, what files matter
2. **Goal** — what you want, not how to do it
3. **Constraints** — versions, patterns to follow, things to avoid
4. **Acceptance criteria** — how you'll know it's done
5. **Plan first** — ask Claude to plan before coding

### ❌ Bad Prompt
> "Add a search feature."

### ✅ Good Prompt
> "Read `docs/specs/search.md` and `prisma/schema.prisma`. Then in Plan Mode, design a server-side search feature for the `/products` page using Prisma 7's `findMany` with `mode: 'insensitive'`. It should:
> - Accept a `q` query param
> - Paginate with offset/limit (default 20 per page)
> - Return 0 results gracefully (no error)
> - Have a Vitest unit test for the helper and a Playwright e2e test for the UI
>
> Use existing patterns from `src/app/(shop)/products/page.tsx`. Use shadcn's `Input` component. Do not add new dependencies. Ask clarifying questions before producing the plan."

### Prompt Templates You Can Steal

**"Investigate first":**
```
Before answering, READ these files:
- @src/app/api/auth/[...nextauth]/route.ts
- @src/lib/auth.ts
- @prisma/schema.prisma

Then explain how authentication works in this project. Do not 
speculate; if anything is unclear, list what you'd need to read.
```

**"Plan before doing":**
```
Task: [describe the task]
Files involved: [list known files]
Constraints: [list]
Acceptance criteria: [list]

Produce a step-by-step plan with:
1. The list of files to be edited
2. The specific functions to be modified in each
3. The order of operations
4. The test plan
Do not write code until I approve the plan.
```

**"Use subagents for parallel research":**
```
Spin up 3 parallel subagents to investigate:
1. How our current auth handles token refresh
2. Whether we have any existing OAuth utilities
3. How user sessions are persisted in Prisma

Each should return a summary < 200 words. Then synthesize 
into recommendations.
```

## 3.4 Subagents — Your AI Team Members

**What are they?** Specialized AI instances that run in their **own isolated context window**. They do a focused task, return a summary, and their verbose intermediate output **doesn't pollute your main conversation**.

**Why use them?**
- Keep main context clean (huge wins on long sessions)
- Each can have different tool permissions and different models
- Multiple can run in parallel

### Built-in subagents (auto-invoked)
- `general-purpose` — Multi-step research + action
- `Plan` — Researches during Plan Mode

### Creating a custom subagent

Make `.claude/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Expert code reviewer. Use PROACTIVELY immediately after writing or modifying code. Triggers on requests to "review", "check my code", or after edits to TypeScript/React files.
tools: Read, Grep, Glob, Bash
model: sonnet
---
You are a senior code reviewer for a Next.js 16 + Prisma 7 + TypeScript codebase.

Review for:
1. Correctness — does it match the spec?
2. Security — injection, auth flaws, secret leaks
3. Type safety — no `any`, proper Prisma types
4. Style — matches CLAUDE.md conventions
5. Tests — does it have them? Do they cover edge cases?

Output:
- 🟢 Strengths (1-2 bullets)
- 🔴 Issues (with file:line and suggested fix)
- 🟡 Suggestions (optional improvements)

Be concrete. Cite file:line. No vague advice.
```

**Invocation:**
- Automatic: just say "review this" → Claude routes to it
- Explicit: `@code-reviewer review my recent changes`
- Session-wide: `claude --agent code-reviewer`

### Subagents to create for your stack
- `prisma-migrator` — handles schema changes safely
- `route-generator` — scaffolds Next.js App Router pages
- `shadcn-installer` — adds/customizes shadcn components
- `security-reviewer` — auth, secrets, input validation
- `test-runner` — runs tests and returns only failures

## 3.5 Hooks — Deterministic Enforcement

**Where CLAUDE.md is *advisory* (followed ~70% of the time), hooks are *deterministic* — they fire 100% of the time on specific events.**

Configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "pnpm prettier --write $CLAUDE_FILE_PATHS" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/block-dangerous-bash.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "pnpm lint && pnpm test" }
        ]
      }
    ]
  }
}
```

**Common hook ideas for your stack:**
- **PostToolUse (Edit/Write):** auto-run Prettier on modified files
- **PreToolUse (Bash):** block destructive commands like `rm -rf`, `DROP TABLE`
- **Stop:** run lint + typecheck before Claude considers a task done
- **SessionStart:** inject current git status + open issues into context

## 3.6 Permissions and Safe Execution

In `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Read(./src/**)",
      "Edit(./src/**)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Read(./.env*)",
      "Edit(./prisma/migrations/*)"
    ]
  }
}
```

For team safety:
- Commit `.claude/settings.json` to git so everyone has the same permissions.
- Use `.claude/settings.local.json` (gitignored) for personal overrides.
- For really risky tasks, use **git worktrees** — Claude works in a sandboxed branch directory; if it goes wild, you just delete the worktree.

---

# 4. 🎯 SKILLS: Complete Guide

## 4.1 What Are Claude Skills?

A **Skill** is a folder containing a `SKILL.md` file plus optional supporting files (scripts, templates, examples) that teaches Claude how to do a *specific* task.

**Analogy:** Skills are like recipes in a recipe book. CLAUDE.md is "rules of the kitchen" (always loaded). Skills sit on the shelf — only the one Claude needs gets pulled out and read.

**Released:** October 2025 by Anthropic. Now an open standard (agentskills.io) supported by Claude Code, Cursor, GitHub Copilot, and Gemini CLI.

## 4.2 Skills vs. MCP vs. Slash Commands vs. Subagents

This is the most confusing part of Claude Code. Here's the simplest mental model:

| Tool | What it is | When to use |
|---|---|---|
| **CLAUDE.md** | Always-loaded project instructions | Stuff Claude needs *every* session |
| **Slash command** | A reusable prompt template | A specific prompt you type often (`/review`, `/commit`) |
| **Skill** | A reusable *workflow* with files | A complex multi-step procedure with examples/scripts |
| **Subagent** | A separate AI instance with isolated context | Tasks that need lots of reading without polluting main context |
| **MCP server** | An external tool/data source | Connecting Claude to real systems (DB, GitHub, browsers) |
| **Hook** | Deterministic script on lifecycle events | Things that MUST happen every time (format, lint, security check) |

**Decision tree:**
- "I want Claude to do X the same way every time" → **Skill**
- "I want Claude to *always* do X" → **Hook** or **CLAUDE.md rule**
- "I need Claude to access external data" → **MCP server**
- "I want to type `/X` to trigger something" → **Slash command** (or a Skill, since they overlap)
- "I want isolated context for a hard sub-task" → **Subagent**

## 4.3 Anatomy of a SKILL.md

```markdown
---
name: prisma-migrate
description: Use when the user wants to add/modify a database model, change Prisma schema, generate a migration, or asks "update the schema". Handles Prisma 7 migration workflow including the new prisma.config.ts pattern.
---

# Prisma 7 Migration Skill

## When invoked
1. Read `prisma/schema.prisma` and `prisma.config.ts`.
2. Read CLAUDE.md to confirm we're on Prisma 7.
3. Confirm with the user what model changes they want.

## Workflow
1. Update `prisma/schema.prisma` with the new/modified model.
2. Run `pnpm prisma format` to normalize.
3. Run `pnpm prisma migrate dev --name <descriptive-name>`.
4. Verify the migration SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`.
5. Update `src/lib/db.ts` types if needed (auto-generated).
6. Update any affected TypeScript code that references the model.
7. Run `pnpm typecheck` and `pnpm test` to confirm nothing broke.

## Critical Prisma 7 rules
- The `datasource` block in schema.prisma does NOT contain `url`. 
  The URL lives in `prisma.config.ts`.
- The PrismaClient is instantiated ONCE in `src/lib/db.ts` with the 
  PrismaPg adapter — don't change this.
- For new fields with required values on existing rows, ALWAYS add 
  a default or run a backfill migration.

## Example
User says: "Add a `bio` field to the User model, optional text."
You:
1. Edit schema.prisma to add `bio String?`.
2. Run `pnpm prisma migrate dev --name add-user-bio`.
3. Confirm the SQL looks correct.
4. Done — no app code changes needed since it's optional.
```

### The Frontmatter — The Most Important Part

Only **two fields** affect whether Claude invokes the skill: `name` and `description`.

**The description is everything.** Claude scans descriptions when deciding which skill to load. If your description is vague, the skill won't trigger when you need it.

**❌ Bad description:** "A helpful skill for database stuff."

**✅ Good description:** "Use when the user wants to add/modify a database model, change Prisma schema, generate a migration, or asks 'update the schema'. Handles Prisma 7 migration workflow."

**Tip from Anthropic's own skill-creator:** Claude tends to *under-trigger* skills, so make descriptions slightly "pushy" — mention concrete trigger phrases.

## 4.4 Where to Store Skills

- **Project skills:** `.claude/skills/<name>/SKILL.md` — shared via git with your team
- **Personal skills:** `~/.claude/skills/<name>/SKILL.md` — available across all your projects
- **Plugin skills:** Distributed via `/plugin` marketplace

## 4.5 Five Skills to Build for YOUR Stack

### Skill 1: `nextjs-app-router-page`
**Trigger description:** "Use when the user asks to create a new page, route, or screen in the Next.js App Router. Handles both server and client components, with optional loading/error boundaries."

### Skill 2: `prisma-migrate`
**Trigger description:** (see example above)

### Skill 3: `shadcn-add-component`
**Trigger description:** "Use when the user wants to add a shadcn/ui component (button, dialog, form, table, etc.) or asks 'add a [component name] component'. Uses shadcn v4 CLI."

```markdown
---
name: shadcn-add-component
description: Use when adding shadcn/ui v4 components. Triggers on "add a button/dialog/form/table/sheet component", "I need a [shadcn component]", "install shadcn X".
---

# shadcn v4 Component Installer

## Workflow
1. Confirm which component(s) the user wants.
2. Run: `pnpm dlx shadcn@latest add <component>`
3. Verify the file was added to `src/components/ui/`.
4. If a component needs Base UI primitives, ensure `@base-ui/react` is installed.
5. Show the user a usage example tailored to their context.

## Notes
- Components are auto-generated — never hand-edit them; re-run the CLI.
- For form components, also install `react-hook-form` and `zod` if not present.
```

### Skill 4: `typed-prisma-server-action`
**Trigger description:** "Use when creating a Next.js Server Action that interacts with the database. Generates a typed action with Zod validation, error handling, and Prisma 7 patterns."

### Skill 5: `commit-message-writer`
**Trigger description:** "Use when the user wants to commit changes. Reads `git diff --staged` and writes a Conventional Commits message."

## 4.6 Tips for Making Skills Actually Get Invoked

1. **Write the description for Claude, not for humans.** List concrete trigger phrases.
2. **Use a "menu" approach** for big skills — SKILL.md is short and references separate files for each sub-flow.
3. **Add concrete before/after examples** in the body — Claude learns better from examples than from rules.
4. **Test with multiple phrasings** — ask the same thing 3 different ways and confirm the skill triggers.
5. **Use Anthropic's `skill-creator` skill** to bootstrap: in Claude Code, say *"Use the skill-creator skill to scaffold a `prisma-migrate` skill for me."*

---

# 5. 🔌 MCP SERVERS BY SITUATION

## 5.1 What Is MCP?

**Model Context Protocol** is an open standard (released by Anthropic Nov 2024, adopted across the industry, donated to the Linux Foundation in Dec 2025) that lets AI tools connect to external systems through a uniform interface.

**The "USB-C for AI" analogy:** Without MCP, every AI tool needed a custom integration for every external service. With MCP, you spin up one server and it works with Claude Code, Cursor, Windsurf, VS Code, etc.

**An MCP server exposes three things:**
- **Tools** — actions Claude can take (run a query, create a PR)
- **Resources** — data Claude can read (files, records)
- **Prompts** — reusable templates the server provides

## 5.2 The Tool Budget Warning ⚠️

**Most MCP servers expose 5–25 tools each.** Past about **40–50 active tools**, Claude starts picking the wrong one because all tool descriptions sit in the context window and the noise overwhelms the signal.

**Rule:** Install only the servers you'll *actually use*. Five well-chosen servers beat twenty. Disable servers you don't need with project-scoped configs.

## 5.3 MCP Configuration

Two files matter:

**`.mcp.json`** (commit to git, no secrets):
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}" }
    },
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "${env:DATABASE_URL}"
      ]
    }
  }
}
```

**Add via CLI:**
```bash
claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres $DATABASE_URL
claude mcp list                       # See what's connected
claude mcp remove <name>              # Remove a server
```

Restart Claude Code after editing `.mcp.json` — it reads the file at startup.

## 5.4 The MCP Catalog — Organized by Situation

### 🗄️ Situation: "I need Claude to interact with my database"

#### **Postgres MCP** (recommended for your stack)
- **What:** Connects Claude to a PostgreSQL instance. Read-only by default. Claude can inspect schemas, run queries, analyze query plans.
- **When:** Whenever a bug is probably data-shaped. *"The dashboard is empty"* → Claude queries staging DB and finds the orphaned foreign key in a minute.
- **Install:**
  ```bash
  claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres "$DATABASE_URL"
  ```
- **Example in your stack:**
  ```
  > Use the postgres MCP to count rows in the User table grouped by 
    createdAt month. Then write a Server Component at 
    src/app/admin/users/page.tsx that displays the same chart 
    using Recharts.
  ```

#### **Prisma MCP** (also recommended — official from Prisma)
- **What:** Built into Prisma CLI: `npx prisma mcp`. Lets Claude manage schema migrations, query data, and create databases — all through Prisma's safety layer.
- **When:** Schema changes, debugging Prisma-specific issues, getting up-to-date Prisma docs.
- **Why pair with Postgres MCP?** Postgres MCP = raw SQL view; Prisma MCP = ORM-aware view with migration safety. They complement each other.

---

### 📁 Situation: "Filesystem access"
- **Skip the filesystem MCP for your main project.** Claude Code already ships with built-in `Read`, `Edit`, `Write`, `Glob`, `Grep` tools.
- **Only install it** if you need to expose *additional* directories outside your project.

---

### 🐙 Situation: "Git / GitHub operations"

#### **GitHub MCP**
- **What:** Full GitHub API access — issues, PRs, reviews, Actions runs, code search.
- **When:** Anything that touches PRs, issue triage, multi-repo work, or automated reviews. The most-installed MCP server of 2026.
- **Install:**
  ```bash
  claude mcp add github -- npx -y @modelcontextprotocol/server-github
  ```
  Set `GITHUB_PERSONAL_ACCESS_TOKEN` in your environment.
- **Example:**
  ```
  > Look at the 5 most recent failing CI runs on the main branch. 
    Find the common pattern. Open an issue summarizing what 
    needs to be fixed.
  ```

---

### 🌐 Situation: "Web browsing / scraping / E2E testing"

#### **Playwright MCP** (the standard)
- **What:** Full headless browser automation. Navigate, click, fill forms, screenshot, run E2E tests.
- **When:** Visual debugging, E2E test writing, scraping JS-heavy pages, agentic web flows.
- **Install:**
  ```bash
  claude mcp add playwright -- npx -y @playwright/mcp
  ```
- **Example:**
  ```
  > Open the dev server at localhost:3000. Log in as test@example.com. 
    Navigate to /checkout. Take a screenshot. Tell me if the price 
    matches what's in the Product table from Postgres MCP.
  ```

#### **Chrome DevTools MCP**
- **What:** Like Playwright but with live DevTools — performance traces, network inspection.
- **When:** Performance debugging, Core Web Vitals work.

---

### 📚 Situation: "I need current documentation"

#### **Context7 MCP** ⭐ HIGHLY RECOMMENDED FOR YOUR STACK
- **What:** Fetches **live, version-specific documentation** for hundreds of libraries.
- **Why your stack desperately needs it:** Claude's training data may not include Next.js 16's async request APIs, Prisma 7's driver adapters and `prisma.config.ts`, React 19 compiler flags, or Tailwind v4 syntax. Without Context7, Claude will confidently use Next.js 14 patterns. With it, you get current docs.
- **Install:**
  ```bash
  claude mcp add context7 -- npx -y @upstash/context7-mcp
  ```
- **Example:**
  ```
  > Use Context7 to fetch the current Next.js 16 docs on middleware. 
    Then refactor src/middleware.ts to use the new API.
  ```

> 🔑 **For your stack specifically:** Also consider the [`nextjs16-agent-skills`](https://github.com/gocallum/nextjs16-agent-skills) skill bundle which includes pre-written Skills for Next.js 16 migration, Prisma 7 migration, and shadcn/ui — saves you from writing them from scratch.

---

### 🧠 Situation: "Memory / cross-session knowledge"

- **Built-in alternative first:** Claude Code has two memory systems already — CLAUDE.md (persistent instructions) and auto-memory (learned notes). Use these before reaching for an MCP.
- **Memory MCP** is useful if you want shared memory across multiple agents/clients or for non-Claude tools. Not a day-one install.

---

### 🧪 Situation: "API testing"

#### **Postman MCP** or generic **Fetch MCP**
- **What:** Make HTTP requests, validate responses, test API contracts.
- **When:** Writing/testing API routes, integrating third-party APIs.
- **Example:** *"Hit our /api/products endpoint with these 5 payloads, check each response shape matches the Zod schema in src/schemas/product.ts."*

---

### 🎨 Situation: "Design / UI"

#### **Figma Dev Mode MCP** (official)
- **What:** Exposes a Figma file's live layer hierarchy, auto-layout, variants, text styles, and design tokens to Claude.
- **When:** Translating designs into code. Goes from "guess from screenshot" to "read actual design tokens."
- **Requires:** Figma desktop app running in Dev Mode.
- **Example:** *"Read the selected Figma frame and build it as a React component using Tailwind v4 and shadcn primitives."*

#### **shadcn MCP**
- **What:** Direct shadcn/ui v4 component browsing and installation through the agent.
- **When:** Heavy UI work where Claude needs to know what shadcn components exist and what their props look like.

---

### 📋 Situation: "Project management"
- **Linear MCP** — read/write issues, project status, sprints.
- **Jira MCP** — if you're in Atlassian land.
- **Notion MCP** — read/write pages and databases; great for "paste this meeting note into the spec doc."
- **When:** Connect your dev workflow to your team's planning tool. Powerful for "look at the Linear issue, then implement it."

---

### 🤔 Situation: "Hard reasoning / planning"

#### **Sequential Thinking MCP**
- **What:** Forces Claude to break problems into explicit sequential reasoning steps with revision and branching.
- **When:** Genuinely hard architectural problems, complex debugging, multi-step planning.
- **Use sparingly:** Adds tokens. Not for every task.

---

### 🚨 Situation: "Production monitoring"

#### **Sentry MCP**
- **What:** Pulls recent errors, groups by frequency, fetches stack traces.
- **When:** *"Look at this morning's top 3 Sentry errors. Find the underlying bug. Open a fix PR for the worst one."*

---

## 5.5 My Recommended Starter Pack for Your Stack

Install these 5 first, add more only when you hit a specific need:

1. ⭐ **Context7** — solves stale-API-knowledge problem (huge for Next.js 16 + Prisma 7 + Tailwind v4)
2. ⭐ **Postgres MCP** — debug data issues 10x faster
3. **GitHub MCP** — PR/issue automation
4. **Playwright MCP** — visual testing + design verification
5. **Prisma MCP** — schema operations with safety

Total tools active: ~50–60. Stays under the 80-tool ceiling.

---

# 6. 💎 TIPS, TRICKS & TRENDS from 2026 Practitioners

## 6.1 The Workflow That Won 2026: Research → Plan → Execute → Review → Ship

This pattern (mentioned in every major Claude Code resource — Anthropic docs, Boris Cherny's tweets, Karpathy's talks, BMAD-METHOD, OpenSpec, Spec Kit) converges across all teams:

1. **Research** — Use Context7, read existing code, gather context. Often via parallel subagents.
2. **Plan** — Write a spec markdown file (`docs/specs/feature.md`) or use Plan Mode. The human reviews here.
3. **Execute** — Claude implements per the approved plan, often in small commits.
4. **Review** — A separate Claude session (or subagent) reviews. Tests run.
5. **Ship** — Open PR, GitHub Actions runs Claude as automated reviewer, merge.

> 🔑 **The killer insight:** "Review at phase gates, not during implementation." Approve 3 documents upfront (requirements, design, tasks), then let Claude execute without interruption. Your approval count drops dramatically; your code quality goes up.

## 6.2 Context Engineering: The Discipline Behind Everything

Tobi Lütke (Shopify CEO) coined "context engineering" in June 2025; Karpathy co-signed it. It is now considered the parent discipline that contains prompt engineering.

**Six layers of context engineering:**
1. **Static context** → CLAUDE.md
2. **Behavioral context** → rules like "never mock data silently"
3. **Persistent context** → memory skills
4. **Modular context** → individual Skills
5. **Context isolation** → subagents
6. **Context pipelines** → research → spec → build workflows

**The mental shift:** You are not just prompting. You are designing a context pipeline that delivers the right information to the right agent at the right time.

## 6.3 Token & Context Management Tips

- **Run `/compact` proactively** every 20–30 minutes of active work, or when you see "context is getting large."
- **Use `/clear`** between unrelated tasks — fresh context beats fighting drift.
- **Use `@filename`** to point at specific files instead of letting Claude search.
- **Keep CLAUDE.md under 200 lines** — bloated files are *worse* than small ones.
- **Use `--effort low`** for simple tasks, `xhigh` for genuinely hard problems.
- **Subagents** for verbose operations (test runs, log analysis) — their output stays in their isolated context.
- **Model picking:** Sonnet 4.6 for routine, Opus 4.7 for hard reasoning, Haiku 4.5 for subagent exploration.

## 6.4 Git Workflow with AI Agents

The community standard in 2026:

- **One feature = one branch** (use `claude -w feature-name` for an isolated worktree).
- **Small commits**, each with a single intent. AI commits get reviewed at the diff level.
- **Conventional Commits** — let Claude write the messages, you stage the chunks.
- **AI as PR reviewer:** run `/install-github-app` once per repo. Claude reviews PRs and often catches real logic errors humans skim past.
- **Customize the review prompt** — the default is too verbose; tune it to your codebase in `.github/claude-code-review.yml`.
- **Always branch before destructive operations.** A bad agent in main is a nightmare; a bad agent in a worktree is `git worktree remove`.

## 6.5 Testing Strategies

- **Write tests first, then code.** Use Claude's TDD loop: tests become the spec, Claude iterates implementation until they pass.
- **Test in a separate subagent** — main session asks for tests; subagent runs them and returns only failures, not the wall of output.
- **Verifiability is the highest-leverage practice.** Claude performs dramatically better when it can verify its own work (run tests, compare screenshots, validate outputs).
- **For your stack:** Vitest for unit tests, Playwright (via the MCP) for E2E. Both integrate beautifully.

## 6.6 Debugging Strategies

- **Spec-driven debugging:** Document the bug in a markdown file (current behavior, expected, repro steps). Tell Claude to read it before investigating.
- **Subagent for investigation:** Keeps main context clean. *"Use a subagent to find where token refresh might fail."*
- **Postgres MCP for data-shaped bugs:** Often the bug isn't in the code, it's in the data.
- **Playwright MCP for UI bugs:** *"Reproduce: open localhost, click X, screenshot, tell me what's wrong."*
- **Boris's debugging trick:** Use two separate Claude sessions — one writes the code, a fresh-context one reviews and finds the bug. Same model, different blind spots.

## 6.7 Avoiding Hallucinations (Real Tactics, Not Magic)

Hallucinations are mostly **API/syntax invention** — Claude confidently writes Next.js 14 code when you're on Next.js 16.

**Tactics that actually work:**
1. **Context7 MCP** — eliminates 80% of API hallucinations by giving Claude live docs.
2. **Tell Claude to investigate before answering:** put in CLAUDE.md: *"Never speculate about code you have not opened. If the user references a file, READ it before answering."*
3. **Allow "I don't know":** add to CLAUDE.md: *"If you don't know the current API or the answer, say so. Do not guess."* — community-validated to cut hallucinations significantly.
4. **Use the bundled docs trick (your stack-specific):** Next.js 16 now ships docs in `node_modules/next/dist/docs/`. Add to AGENTS.md: *"Before any Next.js work, read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated."*
5. **Best-of-N verification:** for critical code, run Claude twice in fresh sessions. Inconsistent answers = hallucination flag.
6. **Spec compliance review:** review code against the spec, not just for correctness. Many "hallucinations" are scope creep.

## 6.8 Anthropic Engineering Wisdom — Top Tips from Boris Cherny & the Team

Collected from Boris Cherny (creator of Claude Code) and the Anthropic dev rel team's tweets and talks (Feb–May 2026):

- **"If you do something more than once a day, turn it into a skill or command."**
- **"Have feature-specific subagents with skills (progressive disclosure) instead of general 'qa engineer' or 'backend engineer'."**
- **"Say 'use subagents' to throw more compute at a problem — offload tasks to keep your main context clean."**
- **"Agent teams with tmux and git worktrees for parallel development."**
- **"Use test-time compute — separate context windows make results better; one agent can cause bugs and another (same model) can find them."**
- **"Use slash commands for every 'inner loop' workflow you do many times a day."**
- **"settings.json for harness-enforced behavior — don't put 'NEVER add Co-Authored-By' in CLAUDE.md when `attribution.commit: \"\"` is deterministic."**
- **"Compound engineering:** Every code review, every correction, every error becomes a new rule in CLAUDE.md. The file grows with the team's experience."

## 6.9 Big-Codebase Tactics

- **Modular CLAUDE.md** — main file under 200 lines, with `@imports` to specialized rule files.
- **Path-scoped rules** — `.claude/rules/api-rules.md` only loads when working in `app/api/`.
- **Nested CLAUDE.md** — put a smaller one inside `src/app/api/` etc.
- **Avoid full-codebase context** — point at specific files with `@`, not "look at everything."
- **WarpGrep or similar dedicated search subagent** — better than Claude's default Haiku search.

---

# 7. 🧐 PROMPT ANALYSIS (/prompt-master section)

## 7.1 The Original Prompt

> *"Can you give me a guide on how to agentic properly so i can study it. You can search on the internet the road map on how to be vibe code/ agentic pro by knowing the structure of the project and how to use the ai properly. Give me also a guide on skill, and our mcp on how to use it by situation, you should list it. And make a md file for that, The explanation should be easy to understand so i can follow it. Also /prompt-master You should analyze this prompt to! You can also suggest or add if you want to. To help me improve. Make sure i can follow the trend and you can search some tips and tricks on internet, and based on their experience to how to do it better and step by step."*

## 7.2 What the Prompt Does Well ✅

1. **Clear primary goal:** Asks for an agentic engineering study guide. The intent is unambiguous.
2. **Names specific deliverable format:** "make a md file for that."
3. **Asks for accessibility:** "easy to understand so I can follow it" — sets the tone correctly.
4. **Requests current information:** "make sure I can follow the trend" — signals "search the web, don't rely on training data."
5. **Asks for self-reflection:** "/prompt-master analyze this prompt" — shows growth mindset.
6. **Invites improvements:** "you can suggest or add if you want to" — gives the AI permission to expand scope.
7. **Specific topics named:** roadmap, project structure, AI usage, skills, MCP by situation — gives a content outline.

## 7.3 What Could Be Improved 🔧

1. **No tech-stack context.** The prompt asks for "project structure" but doesn't say *which* stack. A guide for Python Django is wildly different from Next.js 16. *(In your case, this was inferred from the system context, but you shouldn't rely on that.)*
2. **No skill-level signal in the prompt itself.** "Beginner" is implicit from grammar and phrasing, but not stated. The AI guesses.
3. **No output structure.** It says "md file" but doesn't say "include these sections" or "include code examples."
4. **No length/depth signal.** Should this be 500 words or 50,000? The AI must guess.
5. **No success criteria.** How will you know the guide is good? Without criteria, "good" is undefined.
6. **Typos/grammar make it harder for AI to parse.** "to!" "by knowing the structure" — minor, but adds ambiguity.
7. **Mixed intents in one sentence.** Several distinct requests are bundled together; breaking them into bullets would dramatically improve clarity.
8. **Asks AI to "search the internet" but doesn't specify priority sources.** A list like "Anthropic docs, Boris Cherny tweets, Karpathy talks, /r/ClaudeCode" would target results better.
9. **No role-setting.** The AI doesn't know whether to be a teacher, a mentor, or a peer.
10. **No "iterate" instruction.** A great agentic prompt invites follow-up: *"Ask me clarifying questions before starting."*

## 7.4 A Rewritten Version (Best Practices Demonstrated)

```
ROLE: You are an experienced agentic engineering coach who teaches beginners.

CONTEXT:
- I'm a beginner in coding/tech, not familiar with most tech stacks.
- My stack: Next.js 16.2.6, React 19.2.4, TypeScript 5, Tailwind v4,
  Base UI (@base-ui/react) + shadcn v4, Prisma 7, PostgreSQL.
- My primary AI tool: Claude Code in the terminal.
- My goal: shift from "vibe coding" to "agentic engineering" — 
  production-quality, structured work using Skills and MCP.

TASK: Produce a comprehensive, beginner-friendly study guide as a 
single Markdown file with these exact sections:

1. ROADMAP: Beginner → Agentic Pro (with mindset shifts + common 
   beginner mistakes)
2. PROJECT STRUCTURE for AI Agents (folder layout, CLAUDE.md examples 
   tailored to MY stack, README/ARCHITECTURE/docs strategy, secrets 
   handling)
3. CLAUDE CODE in the Terminal (install, commands, Plan Mode, slash 
   commands, subagents, hooks, permissions)
4. SKILLS Complete Guide (what they are, vs MCP/commands/subagents, 
   SKILL.md anatomy, 5 example skills FOR MY STACK)
5. MCP Servers BY SITUATION (database, filesystem, GitHub, browser, 
   docs, memory, API testing, design, PM, reasoning — with concrete 
   examples in my stack)
6. TIPS & TRENDS from 2026 practitioners (Anthropic engineers, 
   Karpathy, Reddit, HN — context engineering, spec-driven dev, 
   token management, git workflows, testing, debugging, avoiding 
   hallucinations)
7. PROMPT ANALYSIS of my original prompt (good, bad, rewritten version)

CONSTRAINTS:
- Beginner-friendly language with analogies
- Concrete code examples tailored to my stack (no generic Python 
  examples)
- Include a Quick-Start Checklist at the top and Cheat Sheet at the 
  bottom
- Cite sources where relevant (Anthropic docs, named practitioners)
- Use tables, code blocks, headings — make it scannable

PROCESS:
- Search the web for current (2025–2026) information.
- Priority sources: code.claude.com, anthropic.com/engineering, Boris 
  Cherny's tweets, Karpathy talks, /r/ClaudeCode, /r/ClaudeAI, 
  practitioners' blogs (alexop.dev, Builder.io, Morph, etc.)
- If anything is unclear, ask me before producing the guide.

SUCCESS CRITERIA: I should be able to read this once, do the Quick-
Start Checklist in 30 minutes, and have a working agentic Claude Code 
setup that uses my stack correctly.
```

## 7.5 General Principles of Prompt Engineering for Agentic Coding

Distilled from Anthropic's own docs + community wisdom:

1. **Be specific.** Vague in, vague out. Name files, versions, success criteria.
2. **Give context.** What's the project? What's the stack? What patterns exist?
3. **Set the role.** "You are a senior code reviewer" → measurably better reviews.
4. **Define the output format.** Markdown? JSON? Bullet list? File path?
5. **Allow uncertainty.** *"If you don't know, say so."* — drops hallucinations significantly.
6. **Ask for a plan before code.** Reviewable diff before the diff exists.
7. **Iterate.** First prompt rarely perfect. Refine.
8. **Use examples.** One concrete example beats ten abstract rules.
9. **Put rules in CLAUDE.md, not in every prompt.** Don't re-explain conventions.
10. **Don't over-prompt.** Long prompts with redundant rules confuse the model. Keep prompts tight, push reusable rules into config files.

---

# 📝 CHEAT SHEET

## Essential Commands
```
claude                    # Start interactive
claude -p "query"         # One-shot, exits
claude -c                 # Continue last session
claude -w feature-x       # Isolated git worktree
Shift+Tab Shift+Tab       # Toggle Plan Mode
Shift+Tab                 # Cycle Manual / Auto-edit
@filename                 # Reference a specific file
/init                     # Generate starter CLAUDE.md
/clear                    # Wipe context (between tasks!)
/compact                  # Summarize history (when full)
/cost                     # Check token spend
/model                    # Switch Opus/Sonnet/Haiku
/review                   # Code review recent changes
/install-github-app       # Make Claude a PR reviewer
Esc                       # Interrupt Claude mid-action
Esc Esc                   # Rewind menu
```

## Daily Habits
- **/clear between unrelated tasks**
- **Plan Mode for 3+ step tasks**
- **CLAUDE.md update after every "Claude made a mistake" moment** (compound engineering)
- **@filename instead of "search for X"**
- **/compact every 20–30 min in long sessions**

## Decision Tree
- Need to do this *every session*? → **CLAUDE.md rule**
- Need it to *always* happen (deterministic)? → **Hook**
- Reusable workflow? → **Skill**
- Reusable prompt string? → **Slash command**
- Need external data/system? → **MCP server**
- Big task with verbose output? → **Subagent**
- Risky/unknown task? → **Plan Mode + worktree**

## Your Stack — Specific Reminders
- **Next.js 16:** App Router only; Server Components by default; `'use client'` only when needed; read `node_modules/next/dist/docs/` for current API.
- **Prisma 7:** Driver adapter required (`@prisma/adapter-pg`); database URL in `prisma.config.ts`, NOT in `schema.prisma`; PrismaClient instantiated ONCE in `lib/db.ts` with singleton pattern.
- **Tailwind v4:** Different config from v3 — use Context7 MCP if unsure.
- **shadcn v4:** Install via `pnpm dlx shadcn@latest add <component>`; don't hand-edit generated files in `components/ui/`.
- **Base UI (@base-ui/react):** Unstyled primitives; pair with Tailwind.

## My Recommended MCP Starter Pack
1. **Context7** (live docs — critical for your stack)
2. **Postgres MCP** (DB debugging)
3. **GitHub MCP** (PR automation)
4. **Playwright MCP** (E2E + visual debugging)
5. **Prisma MCP** (schema operations)

## The Five-Question CLAUDE.md
1. What is this?
2. What's the stack?
3. Where do things live?
4. How do I run it?
5. What are the rules?

## The Anti-Hallucination Triple
Add to CLAUDE.md:
- *"Never speculate about code you haven't opened — READ the file first."*
- *"If you don't know the current API, say so. Use Context7 MCP to look it up."*
- *"For tasks involving auth, payments, or data deletion: STOP and confirm before writing code."*

---

## 🎓 Final Word

You don't have to internalize this entire guide in one sitting. The roadmap exists for a reason: start with Stage 1 (talking to the agent), reach Stage 2 (CLAUDE.md) within your first week, and graduate to Skills and MCP at your own pace.

The biggest thing to remember: **the AI is your collaborator, not your replacement and not your magic wand.** Your job — and it's a more interesting job than typing semicolons — is to write clear specs, make architectural decisions, verify outputs, and grow your CLAUDE.md every time you learn something new. The teams shipping the cleanest production code in 2026 aren't the ones with the cleverest prompts; they're the ones who treated agentic engineering as a discipline from day one.

Good luck. Now go build something — agentically.

---

*Sources & further reading: code.claude.com (Anthropic's official Claude Code docs), claude.com/blog, Anthropic's skill-creator repo (github.com/anthropics/skills), Boris Cherny's tweets (Jan–Apr 2026), Andrej Karpathy's "From Vibe Coding to Agentic Engineering" talk at AI Engineer 2026, shanraisshan/claude-code-best-practice repo, alexop.dev on spec-driven development, builder.io/blog (Claude Code articles), morphllm.com Claude Code 2026 guide, claudefa.st agentic engineering blog, prisma.io/blog (Prisma 7 + Next.js 16 + MCP), nextjs.org/docs/app/guides/ai-agents, github.com/gocallum/nextjs16-agent-skills, FlorianBruniaux/claude-code-ultimate-guide, builder.io/blog/best-mcp-servers-2026, nimbalyst.com Claude Code MCP rankings.*