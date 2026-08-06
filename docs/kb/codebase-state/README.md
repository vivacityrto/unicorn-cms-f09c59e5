# Codebase State

> As-shipped description of the `<codebase>/` codebase. Lives in `unicorn-kb/`
> (not in `<codebase>/`) because Lovable controls `<codebase>/` and shouldn't
> have to reason about files it didn't create.

---

## Files

- **`module-status.md`** — what's built, what's partial, what's not
  started. Refreshed per feature ship + full regeneration per Lovable
  remix.
- **`codebase-map.md`** — file paths, where routes / hooks / components /
  edge functions live. Highest decay rate; regenerate on any structural
  change.
- **`architecture.md`** — as-shipped system architecture (edge functions
  table, tables, flows). Refreshed when architecture moves.

---

## Every file here carries a Reflects-commit SHA

In addition to the standard shelf-life header, every `codebase-state/*.md`
file carries:

```markdown
> **Reflects commit:** <codebase>@<sha> (YYYY-MM-DD)
```

This is what makes staleness detectable. Before trusting any answer
sourced from `codebase-state/`, compare this SHA to current `<codebase>/`
HEAD. See [../reference/source-precedence.md](../reference/source-precedence.md).

---

## Maintenance triggers

| Trigger | Action |
|---|---|
| Lovable remix | Full regeneration of all three files. See `../handoffs/post-lovable-remix.md`. |
| Material feature ship | Surgical edits to affected sections only. See `../handoffs/lovable-to-codebase.md`. |
| Reflects-commit SHA > 1 month behind HEAD | Review and partial refresh. |
| Someone asks a "where does X live" question and the answer in `codebase-map.md` is wrong | Fix immediately, update SHA. |

---

## What's NOT here

- Team opinion, conventions, decisions — those live in `../pinned/` and
  `../reference/`.
- Flow patterns, ADRs, migration maps — also `../reference/`.
- The product spec (EOS) — lives in the `<codebase>/` codebase or wherever
  the spec canonically lives.

These docs answer "what *is* the shipped code", not "how should we
think about it" or "why did we decide X". Opinion lives elsewhere in
`unicorn-kb/`.
