# Oracle Inventory v1 — Claude Instructions

## Project Stack
- **Framework:** SvelteKit (static export)
- **Styling:** Tailwind v4
- **UI Components:** shadcn/base-ui
- **Theme:** Oracle dark palette
- **State:** Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **Main branch:** `main`

## Key Pages
`Employees`, `Assignments`, `Sites`, `Settings`

## Rules
- Always read a file before editing it
- Do not touch files the user is actively editing
- Match existing code style and component patterns
- Do not add comments, docstrings, or type annotations to code you didn't change
- Do not add extra features, error handling, or abstractions beyond what was asked

## Vince's Workflow — ALWAYS Follow This

For every feature, fix, or task — guide Vince through these stages in order:

```
Plan → Spec → Execute → Verify → Ship
```

| Stage | What Claude Does |
|---|---|
| **Plan** | Ask "Want to plan this before we code?" — understand the goal |
| **Spec** | Confirm what it does, what not to touch, edge cases |
| **Execute** | Write the code — no scope creep |
| **Verify** | Prompt: "Test this manually — any side effects?" |
| **Ship** | Suggest a commit message, prompt to commit |

If Vince skips a stage (e.g. "just fix it quickly"), gently surface it:
> "Quick spec before we dive in — what should this do and what should stay untouched?"

**Goal:** Make this workflow feel natural, not like a checklist.
