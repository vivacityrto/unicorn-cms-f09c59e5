# Source Precedence

> **Last updated:** 2026-04-24 · **Reconsider by:** 2026-10-24 · **Confidence:** high.
>
> The rules Claude follows when multiple sources could answer a question.
> This is the canonical version; the Claude Project's custom instructions
> reference these rules, but if they drift, **this file wins**.

---

## The order

Every turn, in this order:

1. **Pinned KB** — `unicorn-kb/pinned/*.md`. Always in context. Stable
   opinion layer.
2. **`unicorn-kb/reference/` + `unicorn-kb/handoffs/`** via GitHub MCP.
   Deeper opinion: full ADRs, flow patterns, handoff rituals.
3. **`unicorn-kb/codebase-state/`** via GitHub MCP. As-shipped state:
   module-status, codebase-map, architecture. Closer to the code than
   opinion files but not the code itself.
4. **`<codebase>/` repo** via GitHub MCP. Actual source code — ground truth.
5. **Inference** — only with `"Inferring from …"` prefix.

Layers 2 and 3 are both "fetched via MCP" but serve different purposes:
layer 2 is what the team thinks; layer 3 is what got built.

---

## When sources disagree

**Rule:** the one closer to the code wins.

| Conflict | Winner |
|---|---|
| Pinned KB vs `unicorn-kb/reference/` | Pinned (newer + more curated) |
| Pinned KB vs `unicorn-kb/codebase-state/` | `codebase-state/` (describes actual shipped state) |
| `unicorn-kb/reference/` vs `unicorn-kb/codebase-state/` | `codebase-state/` (closer to code); divergence is likely an ADR that didn't ship as planned |
| Any KB layer vs actual `<codebase>/` code | Code. Always. |
| `codebase-state/` vs actual `<codebase>/` code | Code. `codebase-state/` may be stale between remixes. |
| Two pinned files disagree | Bug in the KB. Flag to Carl. |

When the code wins over any KB layer, Claude must:
1. Answer from the code.
2. Flag the divergence to the user in the reply.
3. Apply the "Push back and recommend an update" rule — which file needs
   correcting, with ready-to-paste text. For `codebase-state/` drift,
   the fix is usually regeneration, not manual editing.

---

## Staleness check for codebase-state

Every `codebase-state/*.md` file carries a **Reflects commit** SHA in its
header, pointing at the `<codebase>/` HEAD it was generated from.

Before trusting a `codebase-state/*` answer:
1. Note the Reflects-commit SHA.
2. Compare against current `<codebase>/` HEAD via GitHub MCP.
3. If HEAD has moved significantly since that SHA, flag:
   *"codebase-state was generated at `<codebase>@<sha>`; HEAD is now
   `<current-sha>`. Answer may be stale — verify against current code
   or trigger regeneration per handoffs/post-lovable-remix.md."*

Cadence guidance in `../pinned/kb-hygiene.md → Pruning discipline`:
> 1 month behind HEAD → partial refresh expected; post-remix → full regeneration.

---

## Fetch triggers

Claude should fetch (not infer) when the question is:

- About a specific **flow** (invite, auth, meeting, audit) → fetch
  `reference/flow-patterns.md`.
- About **why** a past decision was made → fetch
  `reference/decision-trail.md`.
- About **module status** → fetch `codebase-state/module-status.md`.
- About **file paths or "where does X live"** → fetch
  `codebase-state/codebase-map.md` or grep the `<codebase>/` codebase.
- About **as-shipped architecture** (edge functions, tables, flows) →
  fetch `codebase-state/architecture.md`.
- About **Unicorn 1.0 → 2.0** mapping → fetch `reference/migration-1to2.md`.
- About a **handoff or ritual** → fetch `handoffs/README.md` then the
  relevant scenario file.
- About **current code behaviour** (vs. documented intent) → grep the
  `<codebase>/` codebase via GitHub MCP directly.

---

## When to stay in pinned context

- Vocabulary lookups → `pinned/glossary.md` (already loaded).
- Convention questions (RLS, auth, query patterns) →
  `pinned/conventions.md` (already loaded).
- Team roles / tool access → `pinned/team-roles.md` (already loaded).
- Is a decision open or decided → `pinned/decisions.md` (already loaded),
  then fetch `reference/decision-trail.md` only if full rationale needed.

---

## When GitHub MCP is unavailable

Fall back to pinned KB and flag: *"I can't reach the repo right now —
answering from pinned KB only. Verify against the codebase before
acting."*

Never fabricate a fetch. If you would have fetched but can't, say so.
