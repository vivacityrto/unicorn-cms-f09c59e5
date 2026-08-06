# Unicorn 2.0 — Knowledge Base

Team opinion, decisions, patterns, handoffs, and as-shipped state docs for
Unicorn 2.0. Lives at `docs/kb/` inside the main codebase repo.

> **Migrated 2026-08-06** from the standalone `unicorn-kb` repo, now that
> direct git hotfix PRs to the codebase are a verified-safe, standing path —
> the original reason for keeping this out of Lovable's reach (uncertainty
> about git-PR/Lovable-sync compatibility) no longer applies. `unicorn-kb` is
> archived on GitHub (read-only, full history preserved). See the root
> [CLAUDE.md](../../CLAUDE.md) → "Consolidation note" for the full story.

## Folder structure

```
docs/kb/
├── pinned/          ← the stable opinion layer — conventions, decisions, glossary
├── reference/        ← longer-form opinion — full ADRs, flow patterns, cadence
├── codebase-state/    ← as-shipped state of this codebase
└── handoffs/          ← scenario-specific procedures
```

**Pinned files** are the stable opinion layer. They change in months, not
weeks.

**Reference files** are longer-form opinion — full ADRs, flow patterns,
cadence, migration history.

**Codebase-state files** describe the shipped codebase — what's built, where
things live, as-shipped architecture. Every file carries a **Reflects commit**
SHA pointing at the codebase HEAD it was generated from. Regeneration ritual
lives in [handoffs/post-lovable-remix.md](handoffs/post-lovable-remix.md).

**Handoff files** are role- and scenario-specific procedures — e.g. "I just
finished a Claude Code session, what goes back to the KB?" Start at
[handoffs/README.md](handoffs/README.md) for the lookup table.

## Source precedence

1. Pinned KB (`pinned/`)
2. `reference/` + `handoffs/`
3. `codebase-state/`
4. Actual source code in this repo
5. Inference (flagged with "Inferring from …")

When any KB layer and the actual codebase disagree, the codebase wins. Full
rules in [reference/source-precedence.md](reference/source-precedence.md).

## How to update

- Conventions, decisions, patterns, ADRs → PR against `docs/kb/` on a
  `chore/<slug>` branch (see root `AGENTS.md` for branch naming).
- Codebase state (module status, codebase map, architecture) → PR against
  `docs/kb/codebase-state/`; full regeneration after a Lovable remix, surgical
  edits per feature ship.
- Audit narrative → `docs/audit-log/` (see [docs/audit-log/README.md](../audit-log/README.md)).
- Non-git stakeholders → see
  [handoffs/non-technical-proposal.md](handoffs/non-technical-proposal.md).

See [pinned/kb-hygiene.md](pinned/kb-hygiene.md) for the full policy on shelf
life, review cadence, and what never goes in.

## A note on the legacy claude.ai Project

Before the consolidation, `unicorn-kb`'s `pinned/` folder was uploaded
directly to a claude.ai Project, with `reference/`, `codebase-state/`, and
`handoffs/` fetched on demand via that Project's GitHub MCP connector pointed
at the `unicorn-kb` repo. Archiving `unicorn-kb` doesn't break those reads
(archived GitHub repos stay readable, just non-writable) — but content in the
archived repo is now frozen. **That Project's custom instructions and GitHub
MCP connector target need to be manually repointed at this repo's `docs/kb/`
path**, or the Project will keep reading a stale snapshot. This wasn't done as
part of the migration (it's a claude.ai UI setting, out of reach from a repo
session).

## What's NOT here

- Secrets, API keys, Supabase service-role keys, Stripe keys (never).
- Raw migration SQL — points to `supabase/migrations/` in this repo.
- Lovable preview URLs / project IDs beyond what's in `supabase/config.toml`.
- Personal identifying info about clients beyond role names.
- The product spec (EOS) — lives in `docs/` (the product-docs side, not
  `docs/kb/`) or wherever the spec canonically lives.
