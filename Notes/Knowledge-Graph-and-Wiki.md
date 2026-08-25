---
date: 2026-07-27
tags: [note, architecture]
---

# Vault Wiki and Graphify Operations

## Purpose

Obsidian wiki links provide the maintained navigation layer. Graphify is a generated discovery and audit layer; it does not replace [[Context]], [[Home]], status trackers, ADRs, journals, or implementation evidence.

## Wiki Rules

- Start at [[Home]], then read [[Context]].
- Link every note from the Home Vault Index and add relevant backlinks.
- Keep current truth in Context, detailed status in [[Planning/Pages/_Overview]], high-level work in [[Planning/PLAN]], rationale in [[Decisions/README]], and dated evidence in `Journal/`.
- Use stable concept names for assets, devices, interfaces, sites, networks, CCTV, imports, and deployments so graph nodes remain understandable.

## Graphify Baseline

The existing `graphify-out/` snapshot was generated on 2026-05-23 from 72 files and is stale relative to the current vault and code. It remains useful as historical evidence only. The Graphify executable is not currently available on PATH, so no refresh was run on 2026-07-27.

## Safe Refresh Policy

1. Refresh only after an approved architecture or implementation milestone.
2. Exclude secrets, `.env` files, credentials, raw password columns, production exports, uploaded evidence, generated Prisma clients, caches, `node_modules`, and Graphify's own output.
3. Prefer an incremental update after reviewing the detected corpus and exclusions.
4. Review EXTRACTED, INFERRED, and AMBIGUOUS relationships before treating them as project knowledge.
5. Record the run date, corpus, exclusions, node/edge counts, and important findings in the session journal.
6. Link the accepted report from [[Home]], but retain [[Context]] and the code/deployment evidence as the source of truth.

## Intended Outputs

- `graphify-out/graph.html` for interactive exploration.
- `graphify-out/graph.json` for query/GraphRAG experiments.
- `graphify-out/GRAPH_REPORT.md` for auditable findings.

Do not publish these outputs externally until their corpus has been checked for sensitive data.

[[Home]] | [[Context]] | [[Planning/Inventory-System-Blueprint]]
