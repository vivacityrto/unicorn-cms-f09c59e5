# Unicorn 2.0 — Knowledge Base

Source of truth for the Unicorn 2.0 Claude Project's knowledge layer.

> **Corrected 2026-09-01** (was pre-consolidation three-repo content, stale
> since 2026-08-06): this KB lives at `docs/kb/` **inside the single main
> codebase repo** (`unicorn-cms-f09c59e5`) — not a separate `unicorn-kb/`
> repo. It was migrated in 2026-08-06 once direct git hotfix PRs to the
> codebase were confirmed a verified-safe, standing path (the original
> reason for keeping it out of Lovable's reach — uncertainty about
> git-PR/Lovable-sync compatibility — no longer applied). The former
> `unicorn-kb` and `unicorn-audit` repos are archived on GitHub (read-only,
> full history preserved). See the codebase repo's `docs/kb/README.md` for
> the full current-state version of this page, and its root `CLAUDE.md` →
> "Consolidation note" for the full story. **If you're reading this as a
> claude.ai Project pinned upload, the Project's GitHub MCP connector target
> may still need repointing at `docs/kb/` in the codebase repo** — that
> repointing is a claude.ai UI setting, out of reach from a repo session, and
> wasn't confirmed done as part of the migration.

## Folder structure

```
docs/kb/                (inside the codebase repo, not a separate repo)
├── pinned/          ← the stable opinion layer — conventions, decisions, glossary
├── reference/        ← longer-form opinion — full ADRs, flow patterns, cadence
├── codebase-state/    ← as-shipped state of this codebase
└── handoffs/          ← scenario-specific procedures
```

**Pinned files** are the stable opinion layer. They change in months, not
weeks. If uploaded directly to a claude.ai Project, every chat has them in
context without a fetch.

**Reference files** are longer-form or volatile. Fetched via GitHub MCP (or
read directly in a repo session) when the conversation calls for them — not
pinned because the cost-per-token of keeping them in every chat isn't worth
it.

**Codebase-state files** describe the shipped codebase — what's built, where
things live, as-shipped architecture. Every file carries a **Reflects commit**
SHA pointing at the codebase HEAD it was generated from.

**Handoff files** are role- and scenario-specific procedures — e.g. "I just
finished a Claude Code session, what goes back to the KB?" Start at
[handoffs/README.md](../handoffs/README.md) for the lookup table.

## Source precedence

1. Pinned KB (`pinned/`)
2. `reference/` + `handoffs/`
3. `codebase-state/`
4. Actual source code in the codebase repo
5. Inference (flagged)

When any KB layer and the actual codebase disagree, the codebase wins. Full
rules in [reference/source-precedence.md](../reference/source-precedence.md).

## How to update

- Conventions, decisions, patterns, ADRs → PR against `docs/kb/` on a
  `chore/<slug>` branch (see the codebase repo's `AGENTS.md` for branch
  naming).
- Codebase state (module status, codebase map, architecture) → PR against
  `docs/kb/codebase-state/`; full regeneration after a Lovable remix,
  surgical edits per feature ship.
- Audit narrative → `docs/audit-log/` in the codebase repo (Carl-authored for
  reconciliations and remixes; dev-authored for Lovable prod DB change
  sessions — see `handoffs/lovable-production-db-change.md`).
- Non-git stakeholders → paste into the designated Claude Project inbox
  thread; see [handoffs/non-technical-proposal.md](../handoffs/non-technical-proposal.md).

See [kb-hygiene.md](kb-hygiene.md) for the full policy on shelf life, review
cadence, and what never goes in.

## What's NOT here

- Secrets, API keys, Supabase service-role keys, Stripe keys (never).
- Raw migration SQL (points to `supabase/migrations/` in the codebase repo).
- Lovable preview URLs / project IDs beyond what's in the codebase's
  `supabase/config.toml`.
- Personal identifying info about clients beyond role names.
