# Codebase State

> As-shipped description of the codebase. Lives at `docs/kb/codebase-state/`
> **inside the same repo as the codebase itself** (migrated here 2026-08-06
> from the standalone `unicorn-kb` repo — see `docs/kb/README.md`). Lovable
> still shouldn't have to reason about these files, but that's now a
> convention (KB paths are out of scope for Lovable prompts), not a
> repo-boundary guarantee.

---

## Files

The three core, actively-regenerated files:

- **`module-status.md`** — what's built, what's partial, what's not
  started. Refreshed per feature ship + full regeneration per Lovable
  remix.
- **`codebase-map.md`** — file paths, where routes / hooks / components /
  edge functions live. Highest decay rate; regenerate on any structural
  change.
- **`architecture.md`** — as-shipped system architecture (edge functions
  table, tables, flows). Refreshed when architecture moves.

The rest — dated snapshots, in-progress trackers, and completed-module
records, not regenerated on the same cadence (see
[`../reference/README.md`](../reference/README.md) for the full lifecycle
status of every file here, not just these three):

- **`audit-log-inventory.md`** — live-schema snapshot of `docs/audit-log/`-relevant tables.
- **`feature-matrix-2026-05-20.md`** — dated per-route feature-status matrix for client-side roles.
- **`internal-staff-audit-2026-07-29.md`** — dated internal-staff Playwright audit findings.
- **`kpi-module.md`** — completed KPI module implementation record.
- **`kpi-module-remaining.md`** — in-progress tracker for remaining KPI work.
- **`messaging-pipeline.md`** — as-shipped messaging/broadcast pipeline state.
- **`route-inventory-by-role.md`** — generated route-by-guard-tier tables; regenerate with `node scripts/generate-route-manifest.mjs`, check drift with `node scripts/check-route-drift.mjs`.
- **`super-admin-executive-academy-audit-2026-07-29.md`** — dated SuperAdmin/Executive/Academy Builder Playwright audit findings.
- **`super-admin-exploration-2026-05-21.md`** — dated SuperAdmin feature exploration findings.

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
- The product spec (EOS) — lives in the codebase's `docs/` (product-docs
  side, not `docs/kb/`) or wherever the spec canonically lives.

These docs answer "what *is* the shipped code", not "how should we
think about it" or "why did we decide X". Opinion lives elsewhere in
`docs/kb/pinned/` and `docs/kb/reference/`.
