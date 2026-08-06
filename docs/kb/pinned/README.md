# Unicorn 2.0 — Knowledge Base

Source of truth for the Unicorn 2.0 Claude Project's knowledge layer. This repo
is one of three that work together:

| Repo | Purpose | Lovable sees |
|---|---|---|
| `<codebase>/` | The actual codebase. Lovable builds here. | Yes |
| `unicorn-kb/` | This repo. Team opinion, decisions, patterns, handoffs. | No |
| `unicorn-audit/` | Carl's audit trail — narrative record of reconciliations. | No |

## Folder structure

```
unicorn-kb/
├── pinned/        ← uploaded to the Claude Project (always in context)
├── reference/     ← fetched via GitHub MCP on demand
└── handoffs/      ← scenario-specific procedures
```

**Pinned files** are the stable opinion layer. They change in months, not
weeks. Uploading them to the Claude Project means every chat has them in
context without a fetch.

**Reference files** are longer-form or volatile. Claude fetches them through
the GitHub connector when the conversation calls for them. Not pinned because
the cost-per-token of keeping them in every chat isn't worth it.

**Handoff files** are role- and scenario-specific procedures — e.g. "I just
finished a Claude Code session, what goes back to the KB?" Start at
[handoffs/README.md](handoffs/README.md) for the lookup table.

## Source precedence

The Claude Project's custom instructions encode:

1. Pinned KB → 2. `unicorn-kb/` via GitHub MCP → 3. `<codebase>/` via GitHub MCP
→ 4. inference (flagged).

When pinned KB and the repo disagree, the repo wins.

## How to update

- Conventions, decisions, patterns → PR against `unicorn-kb/` on a branch.
- Module status / codebase map / as-shipped architecture → `unicorn-kb/codebase-state/`,
  lives in the KB (not in the codebase repo — Lovable shouldn't touch these files).
- Audit narrative → `unicorn-audit/` (Carl-authored for reconciliations and remixes; dev-authored for Lovable prod DB change sessions — see `handoffs/lovable-production-db-change.md`).
- Non-git stakeholders → paste into the designated Claude Project inbox
  thread; see [handoffs/non-technical-proposal.md](handoffs/non-technical-proposal.md).

See [pinned/kb-hygiene.md](pinned/kb-hygiene.md) for the full policy on shelf
life, review cadence, and what never goes in.

## What's NOT here

- Secrets, API keys, Supabase service-role keys, Stripe keys (never).
- Raw migration SQL (points to `supabase/migrations/` in the codebase repo).
- Lovable preview URLs / project IDs beyond what's in the codebase's
  `supabase/config.toml`.
- Personal identifying info about clients beyond role names.
