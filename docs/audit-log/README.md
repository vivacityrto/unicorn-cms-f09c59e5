# Unicorn Audit Trail

> Narrative record of reconciliations, production DB change sessions, and key
> decisions. Authorship is split by session type: **Carl** authors
> reconciliations, remixes, and standing audit narrative. **The dev who ran
> the session** authors Lovable production DB change sessions (following
> `docs/kb/handoffs/lovable-production-db-change.md`) or an equivalent
> hand-applied hotfix touching schema/RLS/triggers; Carl reviews those entries
> via PR — same as any other change to this repo.
>
> This exists to give "on my terms" commit history for moments when something
> was audited, reconciled, or consciously decided — without depending on what
> Lovable, Supabase, or anyone else captured.

> **Migrated 2026-08-06** from the standalone `unicorn-audit` repo. The
> original reason it lived separately — keeping audit narrative and the
> Lovable-owned codebase out of each other's way, at a time when git-PR/Lovable
> sync compatibility wasn't yet confirmed — no longer applies. `unicorn-audit`
> is archived on GitHub (read-only, history + tags preserved, not deleted). See
> the root [CLAUDE.md](../../CLAUDE.md) → "Consolidation note" for the full
> story. The separate branch-per-entry / tag-per-entry ritual described in the
> old repo's `CLAUDE.md` is retired — entries now ship as a normal doc in
> whatever PR made the change (or a quick follow-up docs-only PR), same
> conventions as everything else in this repo.

---

## What lives here

```
docs/audit-log/
├── README.md    ← this file
├── INDEX.md     ← chronological list of audits
└── entries/     ← one file per audit event
    └── YYYY-MM-DD-<slug>.md
```

---

## When to create an audit entry

**Always:**
- After a Lovable remix (see
  [../kb/handoffs/post-lovable-remix.md](../kb/handoffs/post-lovable-remix.md)).
- After a Lovable production DB change session, or an equivalent hand-applied
  hotfix touching a migration, FK, RLS policy, trigger, enum, or data backfill
  (see
  [../kb/handoffs/lovable-production-db-change.md](../kb/handoffs/lovable-production-db-change.md))
  — authored by the dev who ran the session; Carl reviews via PR.

**Sometimes (your judgement):**
- Resolving an Open Decision that's been open > 90 days.
- Reconciling a divergence between pinned KB and shipped code.
- Shipping a material convention change across multiple files.
- After a session that surfaced something future-you will want to find via
  `git log --grep="audit:"`.

**Never:**
- Routine PRs.
- Shelf-life re-dates.
- Typo fixes.
- Normal feature work.

Audits are ad-hoc — no calendar, no quota. Too many audit docs and the signal
drowns; too few and the point is lost.

---

## Template

Create `entries/YYYY-MM-DD-<slug>.md` with this shape:

```markdown
# Audit: YYYY-MM-DD — <slug>

**Trigger:** scheduled / post-remix / ADR-driven / drift-surfaced / ad-hoc
**Scope:** what you looked at, what you didn't

## Findings
- Concrete, one bullet per finding.
- Note discrepancies between KB and codebase.

## KB changes shipped
- docs/kb @ <commit-sha>: brief description
- (or "no changes" if read-only audit)

## Code changes (if this entry accompanies one)
- <commit-sha>: what changed

## Decisions
- ADR-NNN drafted / resolved / superseded
- Brainstorm entries promoted/archived

## Open questions parked
- Things you noticed but didn't action this time
```

---

## Commit conventions

**Branch:** whatever branch is making the accompanying change (e.g.
`hotfix/<slug>`), or `chore/<slug>` for an audit-only entry.

**Commit message** (if the entry is its own commit within the PR):
```
audit(<scope>): <short summary>

- Bullet finding
- Bullet finding
```

---

## Retrieval

- All audits: `git log --grep="audit:" --oneline`
- Latest audit: `ls -t docs/audit-log/entries/ | head -1`
- Search for a topic: `git log --grep="<keyword>" --all -- docs/audit-log/`

`INDEX.md` is a human-readable chronological list; keep it updated as a
backup to git log.

---

## Source precedence inside this folder

When reasoning during an audit:
1. Actual codebase (this repo) — ground truth.
2. `docs/kb/` for team opinion and conventions.
3. Previous entries in `entries/` for historical context.
4. Inference — flag with "Inferring from …".

When the codebase and KB disagree, the codebase wins and the divergence is
the finding.
