# Unicorn 2.0 — CLAUDE.md

@AGENTS.md

The import above pulls in the cross-tool rulebook (dev environment, repo
layout, write permissions, branch naming, schema/RLS/trigger audit
requirement) shared with Cursor and Codex. This file adds Claude-Code-specific
session mechanics on top of it.

## Consolidation note (2026-08-06)

This repo used to be one of three: `unicorn-kb` (team knowledge base) and
`unicorn-audit` (audit trail) were separate repos, split out from the
Lovable-generated codebase back when it wasn't yet confirmed that hand-applied
git PRs would sync safely into Lovable's view of things. That's since been
verified, direct git hotfixes are now the standing default way to edit this
repo, and there's no longer a reason to keep KB and audit content in separate
repos out of Lovable's reach. Both were migrated in here as `docs/kb/` and
`docs/audit-log/`, and the two source repos were archived on GitHub (read-only,
history preserved, not deleted).

If you land on a reference to `unicorn-kb/` or `unicorn-audit/` in an older
handoff doc or audit entry, read it as historical — the content now lives at
the equivalent `docs/kb/` or `docs/audit-log/` path in this repo. Historical
docs and audit entries were **not** rewritten to update those references (they
were true when written); only the living entry-point docs
(`docs/kb/README.md`, `docs/kb/pinned/kb-hygiene.md`, `docs/audit-log/README.md`,
this file, and `AGENTS.md`) describe the current structure.

## Session start

No automatic git pulls on session start. Begin work directly. If this repo's
working tree is dirty at the start of a session from something other than
this session's own changes, flag it — don't stash, commit, or revert it.

## Session end ritual

1. Confirm branch is clean except for intended changes.
2. Commit with a conventional-commits message (`fix:`, `feat:`, `hotfix:`,
   `chore:`, `docs:`, `audit:` — see `AGENTS.md → Write permissions & branch
   naming`).
3. `git push -u origin <branch>`.
4. Open PR via `gh pr create` (fallback: GitHub MCP). PR title = commit
   summary; PR description includes what changed, and for a hand-applied
   change, notes that it's a direct git hotfix (not routed through Lovable).
   For schema/RLS/trigger work, link the audit entry.
5. **Default: do not auto-merge** — stop after PR creation. Merge only if the
   user explicitly asks in that session; a grant from an earlier session does
   not carry forward.
6. Summarise what shipped: branch name, commit SHA, PR URL.

If both `gh` CLI and GitHub MCP are unavailable: stop at push and report the
branch URL.

## Entry docs

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Cross-tool rulebook — dev environment, write permissions, branch naming, Lovable guardrails |
| `docs/kb/README.md` | KB orientation |
| `docs/kb/pinned/kb-hygiene.md` | KB policy — freshness, size discipline, ownership |
| `docs/kb/handoffs/README.md` | Scenario procedures lookup |
| `docs/kb/handoffs/post-lovable-remix.md` | What to do after a Lovable remix |
| `docs/kb/handoffs/lovable-production-db-change.md` | Workflow for any Lovable prompt touching production schema, constraints, triggers, RLS, or data |
| `docs/kb/pinned/lovable-prompt-guardrails.md` | Mandatory guardrail blocks for every Lovable prompt |
| `docs/audit-log/README.md` | Audit trail — when to write an entry, template, retrieval |
| `docs/audit-log/INDEX.md` | Chronological list of audit entries |

## Lovable production DB change sessions

**Trigger condition.** When a session is heading toward generating a Lovable
prompt that creates or alters a migration, FK constraint, RLS policy, trigger,
enum, or data backfill in Supabase, this section applies. UI-only changes with
no migration do not trigger it.

**Required behaviour before drafting any Lovable prompt:**
1. STOP.
2. Read `docs/kb/handoffs/lovable-production-db-change.md` end-to-end before
   writing a single Lovable prompt.
3. Apply its principles in full: Prompt 1 → Audit (plan mode on, read-only),
   design decisions gate, Prompt 2 → implementation plan, Prompts 3–N →
   phased implementation, dry-run before any live data operation, final
   prompt → verification and sign-off.

**When the same kind of change is hand-written and shipped as a git hotfix
instead**, the phased-prompt steps don't apply, but the audit-entry
requirement below still does.

**Audit entry.** The dev who ran the session authors the entry in
`docs/audit-log/entries/YYYY-MM-DD-<slug>.md` per the template in
`docs/audit-log/README.md`, as part of the same PR or a quick follow-up. No
separate repo, branch, or tag ritual — it's a normal doc in this repo's PR
flow.

## Single-repo sessions

This is now the only repo for day-to-day Unicorn 2.0 work. If you're opening
Claude Code somewhere that still resolves to the old
`~/repository/unicorn-workspace/` multi-repo layout, this repo's `CLAUDE.md`
and `AGENTS.md` are authoritative going forward; the workspace-root
`CLAUDE.md` there is a thin pointer, not a second source of rules.
