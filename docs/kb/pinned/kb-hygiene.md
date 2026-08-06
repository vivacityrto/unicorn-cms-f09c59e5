# KB Hygiene

> **Last updated:** 2026-04-28 · **Reconsider by:** 2026-10-28 · **Confidence:** high (meta-doc).
>
> How to keep this knowledge base useful over time. Applies to both the KB
> itself and the team maintaining it.

---

## The single-repo architecture (since 2026-08-06)

Unicorn 2.0's knowledge and code used to live in three git repos
(`unicorn-kb`, `unicorn-audit`, and the codebase); they're now consolidated
into one repo, because the original reason for the split — uncertainty about
whether hand-applied git PRs would sync safely into Lovable's view of the
codebase — was resolved (direct git hotfixes are a verified-safe, standing
path now). `unicorn-kb` and `unicorn-audit` are archived on GitHub, read-only,
history intact. See the root `CLAUDE.md → "Consolidation note"` for the story.

```
docs/                 ← in-codebase product/feature docs that Lovable reads
                        and updates as it ships features (specs, naming
                        conventions, integration notes, smoke tests). NOT
                        a substitute for docs/kb/ — that owns team opinion,
                        decisions, and patterns; docs/ (this level) owns
                        code-adjacent reference Lovable needs in-context.

docs/kb/              ← team KB. This file's folder.
  ├── pinned/         ← uploaded to Claude Project (always in context)
  ├── reference/      ← fetched via GitHub MCP on demand
  ├── codebase-state/ ← fetched via GitHub MCP; as-shipped state of the codebase
  └── handoffs/       ← scenario-specific procedures

docs/audit-log/       ← Narrative audit trail. Carl-authored for
                        reconciliations, remixes, and standing audit
                        narrative. Dev-authored for Lovable production DB
                        change sessions per
                        handoffs/lovable-production-db-change.md; Carl
                        reviews those entries via PR.
  └── entries/        ← one markdown file per audit event
```

**Why keep `pinned/`, `reference/`, `codebase-state/`, and `handoffs/`
separate even in one repo.** Pinning the full KB to every chat wastes
context on content most chats don't need. Pinning only the stable opinion
layer and fetching the rest on demand keeps signal density high. Audit
narrative is readable but not routed to in chat — it's historical, not a
current-state source (see "Source precedence" below).

**Guardrail: `docs/kb/` and `docs/audit-log/` are off-limits to Lovable.**
Now that these live inside the same repo Lovable generates against, treat
any Lovable-authored diff touching those paths as scope creep — flag and
revert, don't fold it in silently. This is the trade-off accepted by
consolidating: convenience of one repo, at the cost of needing to actively
watch that Lovable doesn't touch process docs it has no business editing.

**`docs/` vs `docs/kb/` — which owns what.** The top level of `docs/` holds
material Lovable needs to reason about while generating code — feature
specs, naming conventions, API integration references, UI smoke tests.
`docs/kb/` does not duplicate those. It owns team opinion (conventions,
ADRs, brainstorm-log), decisions, and as-shipped descriptions
(codebase-state). When in doubt: if Lovable benefits from reading it during
a prompt, it goes in `docs/`; if it would distract Lovable or only
humans/Carl care, it goes in `docs/kb/`.

Slice 2 of the Clean Architecture refactor (see
`reference/clean-architecture-refactor.md`) proposes adding
`<codebase>/src/ARCHITECTURE.md` for exactly this reason — Lovable needs
the rule in-context to follow it.

---

## Pinned vs fetched — what lives where

| Layer | Folder | Files | When Claude reads it |
|---|---|---|---|
| Pinned | `pinned/` | orientation, conventions, decisions (index), team-roles, glossary, kb-hygiene | Every turn |
| Reference | `reference/` | flow-patterns, decision-trail, brainstorm-log, migration-1to2, cadence, source-precedence | On demand, via GitHub MCP |
| Codebase state | `codebase-state/` | module-status, codebase-map, architecture | On demand, via GitHub MCP |
| Handoffs | `handoffs/` | README + 4 scenario files | On demand, via GitHub MCP |
| Source code | `<codebase>/` (separate repo) | the actual codebase | On demand, via GitHub MCP |

**GitHub MCP connector setup (required for the "fetched" layers).** The GitHub MCP connector in claude.ai chat must be set up per-user before any "fetched on demand" file becomes accessible. Install in claude.ai → Settings → Connectors → GitHub. **Configure with a read-only PAT** — this is intentional; see `pinned/team-roles.md → Tool access matrix → GitHub MCP write path` for why. Writes to `unicorn-kb/` happen exclusively via Claude Code (which uses local `gh`/git credentials).

The routing rules for Claude live in the Claude Project's custom
instructions. Source-of-truth for routing logic is
[../reference/source-precedence.md](../reference/source-precedence.md).

---

## Source-of-truth per fact

One fact lives in one place. Duplicates are bugs.

| Topic | Authoritative location |
|---|---|
| Product context / team / tenant rules | `pinned/orientation.md` |
| RLS / auth / table / query conventions | `pinned/conventions.md` |
| Decision index (who decided what, when) | `pinned/decisions.md` |
| Full ADRs (alternatives, rationale) | `reference/decision-trail.md` |
| Vocabulary / acronyms | `pinned/glossary.md` |
| Team roles + tool access | `pinned/team-roles.md` |
| End-to-end flow patterns | `reference/flow-patterns.md` |
| Raw unresolved thinking | `reference/brainstorm-log.md` |
| Engineering cadence / roadmap | `reference/cadence.md` |
| Active refactor proposals | `reference/clean-architecture-refactor.md` (and future siblings) |
| Unicorn 1.0 → 2.0 mapping | `reference/migration-1to2.md` |
| Source precedence rules | `reference/source-precedence.md` |
| Handoff rituals | `handoffs/*.md` |
| Module status (what's built) | `codebase-state/module-status.md` |
| File paths / where things live | `codebase-state/codebase-map.md` |
| As-shipped system architecture | `codebase-state/architecture.md` |
| Actual code behaviour | this repo's source (ground truth) |
| Audit narrative | `docs/audit-log/entries/*.md` (read-only context; not part of source precedence) |

---

## Size discipline

**Per file.** Target 400 lines. Soft cap 600. Beyond that, split.

**Whole pinned set.** Every line of `pinned/*.md` costs context in every
chat. Target: under 1,500 lines across the pinned folder. Today we're
well inside that.

**Anti-patterns:**
- Pasting raw migration SQL or full edge function source — link to the
  repo path instead.
- Long decision transcripts — summarise to a 3-5 line ADR entry; raw
  conversation belongs in brainstorm-log if anywhere.
- Duplicating the EOS spec — it lives in the codebase (or wherever the
  spec canonically lives) and is referenced, not restated.

---

## Freshness policy

Every `.md` carries a header:

```markdown
> **Last updated:** YYYY-MM-DD · **Reconsider by:** YYYY-MM-DD · **Confidence:** high|medium|low — short reason.
```

`codebase-state/*.md` files additionally carry a **Reflects commit** line
pointing at the `<codebase>/` HEAD SHA they were generated from:

```markdown
> **Reflects commit:** <codebase>@abc1234 (YYYY-MM-DD)
```

Shelf-life defaults by doc type:

| Doc type | Shelf life | Why |
|---|---|---|
| Pinned stable (orientation, conventions, glossary, kb-hygiene) | 6 months | Changes in quarters |
| Pinned volatile (decisions index, team-roles) | 3 months | Open decisions + team shift |
| Reference (flow-patterns, cadence, source-precedence) | 3-6 months | Patterns move slowly, cadence faster |
| Decision-trail (individual ADRs) | 12 months | Long-lived, rarely need re-dating |
| Brainstorm-log | 3 months review | Re-check relevance, archive stale |
| Handoffs | 3 months | Procedures evolve with tool use |
| `codebase-state/*` | Regenerated per Lovable remix or material feature ship | Describes code; decays when code changes |
| Audit docs | n/a | Dated point-in-time records, never updated |

When a shelf-life date passes, the doc is suspect until reviewed. Either
re-date it (even just "re-verified, still accurate") or update the
content. For `codebase-state/*`, check the **Reflects commit** SHA
against `<codebase>/` HEAD — if HEAD has moved, regenerate.

**Confidence levels.** `high` = grounded in code or authoritative source.
`medium` = observation or inference; verify before acting. `low` =
best-effort guess; flag any use. Use `low` sparingly.

---

## Session hygiene (how Claude behaves in a chat)

Enforced via the Claude Project's custom instructions. Rules summarised:

1. **Cite the file.** Every convention names its source file + section.
2. **Code > docs.** When they disagree, the codebase wins. Verify and
   flag. `codebase-state/*` is not the code — it's a description of it
   and can be stale.
3. **Flag speculation.** Prefix with "Inferring from …".
4. **Refuse to fabricate.** If it's not in the KB or codebase, say "I
   don't know" and point to where to look.
5. **Respect shelf life.** Flag past-shelf-life citations. For
   `codebase-state/*`, also check the Reflects commit SHA.
6. **Selective attention.** Narrow questions get narrow reads.
7. **Push back and recommend an update.** When a session surfaces new
   info, STOP and name: (a) what's new, (b) which file should receive
   it, (c) why, (d) ready-to-paste text. Do this even when not asked.

---

## Team hygiene

### Update triggers

| Event | Update |
|---|---|
| New module ships | `codebase-state/module-status.md` + add route to `codebase-state/codebase-map.md` + any new convention to `pinned/conventions.md` |
| New ADR-worthy decision | One-line entry to `pinned/decisions.md` + full ADR in `reference/decision-trail.md` |
| Open decision resolved | Move from `pinned/decisions.md → Open` to the decided log |
| New edge function | Update `codebase-state/architecture.md` + `codebase-state/codebase-map.md` |
| New table | Update `codebase-state/codebase-map.md`; if introducing a pattern, update `pinned/conventions.md` |
| New convention | `pinned/conventions.md` |
| Discovered a bug class / failure mode worth remembering | New ADR in `reference/decision-trail.md` |
| New vocabulary | `pinned/glossary.md` |
| Module scope changes | `codebase-state/module-status.md` + `reference/migration-1to2.md` |
| Priorities shift | `reference/cadence.md` |
| Team composition / tool access changes | `pinned/team-roles.md` |
| Lovable does a remix | Full regeneration of `codebase-state/*` + audit entry |
| Material feature ship | Partial refresh of affected `codebase-state/*` sections |
| Lovable production DB change session ships (or an equivalent hand-applied hotfix touching schema/RLS/triggers) | Audit entry written by the dev who ran the session per `handoffs/lovable-production-db-change.md`; Carl reviews via PR |

### Review cadence

Audits are **ad-hoc** — triggered by drift surfacing, not by calendar. But
shelf-life dates provide a passive trigger: when Claude flags a
past-shelf-life citation in a chat, that's the nudge to review.

**Heuristic triggers for an audit** (i.e. open `docs/audit-log/entries/YYYY-MM-DD-<slug>.md`):
- Lovable does a remix → always trigger ([../handoffs/post-lovable-remix.md](../handoffs/post-lovable-remix.md))
- Claude flags drift between KB and codebase in a chat
- An Open Decision older than 90 days surfaces
- A shelf-life date more than 30 days past
- `codebase-state/` Reflects-commit SHA is weeks behind `<codebase>/` HEAD
- You notice the team answering the same question two different ways

### Who owns what

After the 2026-04-27 seat-centric restructure, the project lead + KB owner seat (Carl) is sole owner of all KB content. Anyone can propose changes; Carl merges. RJ is no longer co-owner of any doc here — he's primarily on ComplyHub now. See `pinned/team-roles.md` for the full seat model.

| Doc | Primary owner |
|---|---|
| `README.md`, `pinned/kb-hygiene.md` | Carl |
| `pinned/orientation.md`, `pinned/team-roles.md` | Carl |
| `pinned/conventions.md`, `reference/flow-patterns.md` | Carl |
| `pinned/decisions.md`, `reference/decision-trail.md`, `reference/migration-1to2.md` | Carl |
| `reference/cadence.md` | Carl |
| `reference/brainstorm-log.md` | Anyone; curated by Carl |
| `pinned/glossary.md` | Anyone; curated by Carl |
| `handoffs/*.md` | Carl |
| `codebase-state/*` | Regenerated post-remix by Carl |
| `docs/audit-log/*` | Carl (reconciliations, remixes, standing narrative); session dev (Lovable prod DB changes); Carl reviews all dev-authored entries |

### Pruning discipline

- **Brainstorm → Decision.** When a brainstorm item resolves, move the
  outcome to `pinned/decisions.md` + full ADR in `reference/decision-trail.md`.
  Leave a one-line tombstone in the brainstorm log pointing to where it went.
- **ADR supersession.** Never delete. Mark `status: superseded` and link
  to the replacement.
- **Open decisions that die of neglect.** If open > 6 months with no
  movement, either (a) delete as actually unimportant, or (b) escalate
  as silently blocking.
- **Handoffs that never fire.** If a handoff hasn't been used in 6
  months, question whether it's real or aspirational.
- **Stale codebase-state.** Post-remix, always regenerate. Between remixes,
  check Reflects-commit SHA; if > 1 month behind HEAD, partial refresh.

---

## What NEVER goes in

- API keys, service-role keys, database passwords, Mailgun creds, Stripe
  secrets.
- Personal identifying info about clients or staff beyond role names.
- Raw migration SQL — link to the migration file path.
- Long code listings — link to file + line, never paste > ~30 lines.
- Lovable preview URLs / project IDs beyond what's in
  `supabase/config.toml`.
- Slack/Teams transcripts — summarise to brainstorm-log or decision-trail.

---

## Signs of health and decay

**Healthy:**
- A new team member can onboard in under a day using only the pinned set.
- Chats in the project rarely ask questions already answered in pinned/.
- Shelf-life dates pass less often than they're reviewed.
- New ADRs land within a day of the decision.
- `codebase-state/` Reflects-commit SHA is recent.

**Decaying:**
- Two files answer the same question differently.
- Claude hallucinates a file path or function name that doesn't exist.
- Shelf-life dates months past due.
- `reference/brainstorm-log.md` has more items than `pinned/decisions.md`
  has entries (decisions not being promoted).
- Someone says "I didn't know that was written down."
- `codebase-state/` describes code that no longer exists post-remix.

When decay shows up, the fix is usually **prune + consolidate +
re-verify**, not "add more docs."
