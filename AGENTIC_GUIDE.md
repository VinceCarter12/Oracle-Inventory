# Agentic & Vibe Coding Guide
### Your Personal Roadmap to Using Claude Code Like a Pro

> **Who this is for:** Vince — someone who already codes alongside Claude and wants to level up from "just asking questions" to running full agentic workflows like a professional.

---

## Table of Contents
1. [What Is Agentic Coding?](#1-what-is-agentic-coding)
2. [The Vibe Coding Mindset](#2-the-vibe-coding-mindset)
3. [Roadmap: Beginner → Pro](#3-roadmap-beginner--pro)
4. [Know Your Project First](#4-know-your-project-first)
5. [How to Write Good Prompts](#5-how-to-write-good-prompts)
6. [Skills — What They Are & When to Use Them](#6-skills--what-they-are--when-to-use-them)
7. [MCP Tools — What They Are & When to Use Them](#7-mcp-tools--what-they-are--when-to-use-them)
8. [Golden Rules of Agentic Work](#8-golden-rules-of-agentic-work)

---

## 1. What Is Agentic Coding?

**Normal coding with AI:** You ask a question → AI answers → you copy-paste → repeat.

**Agentic coding:** You give Claude a *goal*, and Claude plans, reads files, writes code, runs commands, fixes errors, and delivers a working result — like a junior dev you can delegate to.

Think of it like the difference between:
- ❌ "What is the syntax for a forEach loop?"
- ✅ "Add a filter feature to my Employees page — read the existing code first, match the same style, and test that it works."

**Key insight:** Agentic = you set the destination, Claude drives the car.

---

## 2. The Vibe Coding Mindset

Vibe coding means you stay in "creative director" mode while the AI handles execution. Here's the mental shift:

| Old Way (Tool User) | New Way (Agentic Director) |
|---|---|
| "Write me a function" | "Build this feature end-to-end" |
| Fix one bug at a time | Describe the broken behavior, let Claude find the bug |
| Copy-paste code manually | Claude reads, edits, and verifies directly |
| Re-explain context every message | Let Claude read the codebase itself |
| One task per message | Chain tasks: read → plan → code → verify |

**The vibe:** You think in features and outcomes. Claude thinks in files and functions.

---

## 3. Roadmap: Beginner → Pro

> Based on real 2025–2026 agentic engineering research. This is the actual path top developers follow.

### Level 1 — Prompt Basics
- [ ] Give Claude a clear goal, not a vague question
- [ ] Tell Claude where the relevant files are
- [ ] Say what style/framework to match
- [ ] Review Claude's output before accepting it — **never commit code you don't understand**

### Level 2 — Context Awareness
- [ ] Start messages with "Read X file first, then..."
- [ ] Reference specific components: "in the `Employees.svelte` page..."
- [ ] Tell Claude what NOT to touch: "don't modify the sidebar"
- [ ] Ask Claude to explain its plan before writing code
- [ ] Write a `CLAUDE.md` file — conventions, off-limits areas, project patterns

### Level 3 — Spec-Driven Development (SDD)
- [ ] Write a mini-PRD before big features: what it does, user flow, edge cases, data shape
- [ ] Ask for **skeletons first** (structure only), then fill in logic — better output quality
- [ ] Build layered: `structure → logic → refinement` not "do everything at once"
- [ ] Chain tasks with "then": "Read schema → add field → update form → verify imports"
- [ ] Use background agents for long research tasks

### Level 4 — Supervisor Mode (The Shift)
- [ ] You stop executing, you start **reviewing and directing**
- [ ] Focus review on 3 areas: error handling, security, test coverage (AI misses these)
- [ ] Use `/simplify` after every big feature
- [ ] Use skills to trigger specialized behaviors (see Section 6)
- [ ] Use MCP tools to connect to GitHub, Drive, and memory (see Section 7)
- [ ] Set up hooks so Claude auto-runs tasks (e.g., lint before every edit)

### Level 5 — True Agentic Pro (Top 2%)
- [ ] Multi-agent: run specialist agents in parallel on different tasks
- [ ] Claude operates for long sessions with minimal intervention
- [ ] You review outcomes, not steps
- [ ] You have rich context files Claude reads at session start (CLAUDE.md, memory)
- [ ] You deploy early to real users — iterate on real feedback, not imagined perfection
- [ ] Agentic patterns in your workflow: Reflection, Tool Use, Planning, Guardrails

### The "Doom Loop" — What to Avoid
> Poor initial guidance → Claude drifts → you correct → Claude drifts again → loop never ends

**Fix:** Front-load your thinking. 10 minutes planning saves 2 hours of corrections.

---

## 4. Know Your Project First

Before you prompt Claude for anything complex, make sure Claude understands the project. Ask Claude to do this:

```
Read the following and summarize the project structure:
- package.json
- src/ folder (top level)
- Any CLAUDE.md or README files
```

### What Claude should know before big tasks:
- **Stack** — What framework? (SvelteKit, Next.js, etc.)
- **Styling** — Tailwind? CSS modules? Design tokens?
- **File structure** — Where are pages, components, utils?
- **State management** — How is data passed around?
- **Conventions** — Naming patterns, import style, existing patterns

### Oracle Inventory v1 — Quick Reference
| Thing | Answer |
|---|---|
| Framework | SvelteKit (static export) |
| Styling | Tailwind v4 |
| UI Components | shadcn/base-ui |
| Color Theme | Oracle dark palette |
| Key Pages | Employees, Assignments, Sites, Settings |
| Main branch | `main` |

---

## 5. How to Write Good Prompts

### The Formula
```
[Context] + [Goal] + [Constraints] + [Verification]
```

**Bad prompt:**
> "Fix the button"

**Good prompt:**
> "In `src/routes/employees/+page.svelte`, the Add Employee button on line ~45 doesn't open a modal. Read the file, find the issue, and fix it. Don't change the button's styling. After fixing, check if the modal component is properly imported."

### Prompt Tips
1. **Be specific about location** — name the file, component, or line range
2. **State what to preserve** — "keep the existing style", "don't touch X"
3. **Ask for a plan first** — "Before coding, tell me your plan"
4. **Request verification** — "After editing, check for broken imports"
5. **One goal, multiple steps** — chain steps with "then" not multiple messages
6. **Give examples** — "Make it look like the Sites card component"

### Prompt Anti-Patterns to Avoid
| ❌ Don't | ✅ Do Instead |
|---|---|
| "Make it better" | "Improve the loading state to show a skeleton instead of blank space" |
| "Fix all bugs" | "Fix the filter dropdown not resetting when navigating away" |
| "Add dark mode" | "The app already uses dark theme — make the new modal match it" |
| Multiple unrelated requests | One focused request per message |

---

## 6. Skills — What They Are & When to Use Them

Skills are slash commands (`/skill-name`) that trigger specialized Claude behaviors. Type them at the start of your message.

---

### `/update-config`
**What it does:** Changes Claude Code settings — permissions, hooks, environment variables, automated behaviors.

**When to use it:**
- "Allow Claude to run npm commands without asking"
- "Every time Claude stops, show me a summary"
- "Add permission to push to GitHub automatically"
- "Set DEBUG=true environment variable"
- "Before every edit, run the linter automatically"

**Example:**
```
/update-config Allow Claude to run git commands without asking for permission each time
```

---

### `/keybindings-help`
**What it does:** Customize your keyboard shortcuts in Claude Code.

**When to use it:**
- "Change the submit key from Enter to Ctrl+Enter"
- "Add a shortcut to toggle plan mode"
- "Rebind Ctrl+S to something else"

**Example:**
```
/keybindings-help I want Ctrl+Enter to submit instead of just Enter
```

---

### `/simplify`
**What it does:** Reviews recently changed code for quality, removes redundancy, improves efficiency.

**When to use it:**
- After Claude writes a big feature — "clean it up"
- When code feels bloated or repetitive
- After a quick fix that left messy code behind
- "The code works but feels messy, simplify it"

**Example:**
```
/simplify Review the changes to Employees.svelte and clean up anything redundant
```

---

### `/loop`
**What it does:** Runs a prompt or command repeatedly on a time interval.

**When to use it:**
- "Check for new GitHub issues every 10 minutes"
- "Poll my build status every 5 minutes"
- "Run tests every 15 minutes while I work"

**Example:**
```
/loop 5m Check if there are any new failing tests and report them
```

---

### `/schedule`
**What it does:** Creates scheduled remote agents that run on a cron schedule — even when Claude Code is closed.

**When to use it:**
- "Every morning, check for new GitHub PRs"
- "Every Friday, generate a weekly summary of commits"
- "Run a deploy check every night at midnight"

**Example:**
```
/schedule Every weekday at 9am, check the main branch for any failed CI runs and summarize them
```

---

### `/claude-api`
**What it does:** Activates specialized mode for building apps that use the Anthropic/Claude API directly.

**When to use it:**
- Building a chatbot using Claude
- Integrating Claude into your own app
- Using the Anthropic SDK in code
- "Build a feature that calls Claude programmatically"

**Example:**
```
/claude-api Build a simple endpoint that takes user input and returns a Claude completion
```

---

### `/impeccable`
**What it does:** Deep UI/UX review and redesign — visual hierarchy, spacing, colors, accessibility, animations.

**When to use it:**
- "This page looks bland, make it pop"
- "Review the dashboard layout for UX issues"
- "The form doesn't feel right — audit it"
- "Polish the empty state for the Assignments page"
- Any time you want a UI to look more professional

**Example:**
```
/impeccable Review the Employee detail page and improve the visual hierarchy — it feels cluttered
```

---

### `/prompt-master`
**What it does:** Generates optimized prompts for any AI tool (Claude, ChatGPT, Midjourney, Cursor, v0, etc.).

**When to use it:**
- Before giving a big complex request — get Claude to write the prompt for you
- "I want to ask v0 to build a dashboard — write the prompt for me"
- "Help me write a better version of this request"
- When your prompts aren't getting the results you want

**Example:**
```
/prompt-master I want Midjourney to generate a dark oracle-themed UI screenshot for a presentation
```

---

### `/design`
**What it does:** Loads a brand's design system (DESIGN.md) so Claude generates UI that matches your brand perfectly.

**When to use it:**
- Building new components that must match your brand
- "Generate a new card component in our Oracle style"
- Starting a new page from scratch in a branded project

**Example:**
```
/design oracle — now build a new Notifications page that matches our design system
```

---

## 7. MCP Tools — What They Are & When to Use Them

MCP (Model Context Protocol) tools connect Claude to external services. You don't need to type slash commands — just describe what you want and Claude will use the right tool.

---

### GitHub MCP
**Connects Claude to your GitHub repositories.**

| Situation | What to Say |
|---|---|
| See open PRs | "List all open pull requests on the main repo" |
| Read an issue | "Read issue #42 and summarize it" |
| Create a branch | "Create a branch called feature/notifications" |
| Push a file | "Push the updated README to the repo" |
| Create a PR | "Create a pull request from my current branch to main" |
| Search code | "Search the repo for all usages of `fetchEmployees`" |
| Add a comment | "Add a comment to PR #15 saying the review is done" |
| Get latest release | "What's the latest release version of this repo?" |
| Merge a PR | "Merge PR #20 after checking it has no conflicts" |

**Real example for your project:**
```
Check if there are any open issues on the Oracle Inventory repo about the filter dropdown bug
```

---

### Google Drive MCP
**Connects Claude to your Google Drive files.**

| Situation | What to Say |
|---|---|
| Find a file | "Search Drive for the Oracle project spec document" |
| Read a file | "Read the content of the Requirements doc in Drive" |
| Create a file | "Create a new Google Doc with this week's progress notes" |
| Copy a file | "Copy the design mockup to the new project folder" |
| Check permissions | "Who has access to the Oracle Inventory Drive folder?" |
| List recent files | "Show me the last 10 files I accessed in Drive" |
| Download content | "Download the latest CSV export from Drive" |

**Real example:**
```
Search Drive for any documents related to Oracle Inventory requirements and summarize them
```

---

### Memory MCP
**Gives Claude a persistent knowledge graph that survives across conversations.**

| Situation | What to Say |
|---|---|
| Save a decision | "Remember that we decided to use SvelteKit instead of Next.js for v2" |
| Save a person | "Remember that Maria is the QA lead on this project" |
| Recall something | "What do you remember about the authentication approach?" |
| Connect two things | "Link the auth bug to the June deadline issue" |
| Remove old info | "Forget what you saved about the old deploy process" |

**Note:** Claude Code already has a file-based memory system (your MEMORY.md). The Memory MCP adds a graph-based layer on top — useful for complex relationship tracking.

**Real example:**
```
Remember that the Assignments page filter bug is blocked waiting for the backend API to be updated by the team
```

---

### Svelte MCP
**Gives Claude access to official Svelte documentation and code fixes.**

| Situation | What to Say |
|---|---|
| Check syntax | "Look up the correct syntax for Svelte 5 runes" |
| Fix component | "Auto-fix this Svelte component — it has reactivity issues" |
| Get docs | "Show me the official docs for SvelteKit load functions" |
| Browse topics | "List the Svelte documentation sections available" |
| Playground link | "Generate a Svelte playground link for this component" |

**Important:** Always use this when working with Svelte — it references the **official current docs**, not Claude's training data which may be outdated.

**Real example:**
```
Use the Svelte MCP to check if my use of $state() in this component is correct for Svelte 5
```

---

## 8. Golden Rules of Agentic Work

### Before You Prompt
- [ ] Do you know which file/component is involved?
- [ ] Have you described what it should do, not just what's broken?
- [ ] Have you said what to preserve / not touch?
- [ ] For big features: did you write a mini-spec first?

### During the Session
- [ ] Let Claude finish before interrupting
- [ ] Review file changes in the diff before approving
- [ ] If Claude seems stuck, say "stop and explain your plan"
- [ ] Use `/simplify` after big code additions
- [ ] If something seems off, ask: "What assumptions did you make?"

### After Claude Finishes
- [ ] Test the feature manually
- [ ] Review for: error handling, security, test coverage (the 3 areas AI misses)
- [ ] Ask Claude: "Did you introduce any side effects or breaking changes?"
- [ ] Commit with a clear message

### The Pro Habit Loop
```
1. Write a mini-spec (what it does, edge cases, what NOT to change)
2. Ask Claude to read the relevant files first
3. Ask for a skeleton/plan before full code
4. Approve or adjust the plan
5. Let Claude execute
6. Review the diff — focus on error handling, security, tests
7. Test it manually
8. Run /simplify if needed
9. Commit
10. Deploy early → get real feedback → iterate
```

### Agentic Safety Patterns
| Pattern | What It Means | When to Use |
|---|---|---|
| **Reflection** | Claude reviews its own output and improves it | "After writing, review your code for bugs" |
| **Tool Use** | Claude connects to external services (GitHub, Drive) | Anytime you need external data |
| **Planning** | Claude breaks task into steps before executing | Big features, multi-file changes |
| **Guardrails** | Irreversible actions require your confirmation | File deletion, DB writes, git push |
| **Multi-Agent** | Multiple Claudes working in parallel | Large independent tasks |

---

## Bonus: Quick Cheat Sheet

```
/update-config   → Change Claude Code settings & permissions
/simplify        → Clean up messy code after a feature
/impeccable      → Polish UI/UX
/prompt-master   → Write better prompts for any AI
/design          → Brand-consistent UI generation
/schedule        → Recurring automated tasks
/loop            → Repeated polling tasks
/claude-api      → Build with Anthropic API
/keybindings     → Customize shortcuts
```

```
MCP: GitHub      → Manage repos, PRs, issues, branches
MCP: Drive       → Read/write Google Drive files
MCP: Memory      → Persistent knowledge graph
MCP: Svelte      → Official Svelte docs & autofixer
```

---

## 9. Context Files — Your Secret Weapon

The best agentic coders maintain **context files** that Claude reads at the start of every session. This is why Claude performs so much better for them — it already knows the project.

### Files to Maintain in Your Project
| File | What to Put In It |
|---|---|
| `CLAUDE.md` | Stack, conventions, off-limits areas, naming patterns, deploy process |
| `MEMORY.md` | Auto-maintained by Claude — decisions, preferences, project state |
| `AGENTIC_GUIDE.md` | This file — your personal reference |

### What to Put in CLAUDE.md
```markdown
## Project: Oracle Inventory v1
- Stack: SvelteKit, Tailwind v4, shadcn/base-ui
- Theme: Oracle dark palette (see design tokens)
- DO NOT touch: auth logic, deploy config
- Naming: PascalCase components, camelCase functions
- State: Svelte 5 runes ($state, $derived, $effect)
- Before editing any component, read it first
```

**Rule:** Every time you learn something about how the project works, add it to CLAUDE.md. Future-you (and future-Claude) will thank you.

---

*Last updated: May 2026 | Built for Oracle Inventory v1 project*
*Sources: Anthropic Agentic Coding Trends Report 2026, AgenticEngineer.com, Supabase Vibe Coding Guide, GitHub Copilot Agentic Primitives*
