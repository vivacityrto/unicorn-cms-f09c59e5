# KB restructuring: canonical program index + phase-folder hierarchy

**Date:** 2026-09-08

**Packet:** ad hoc, not part of any single phase — a cross-cutting repo-process
change Carl asked for directly, spanning all four tracked initiatives
(Codebase Optimization, RBAC v6, Tenant Operating Model, Client Health
Activity Analytics)

**Scope:** `docs/kb/**` reorganization, two new CI scripts + workflows,
`AGENTS.md`/`kb-hygiene.md` ruleset additions — no application code, schema,
or migration touched

**Hosted state changed:** no — repo-only documentation/tooling change

## Decision

The Codebase Optimization Plan had branched twice with no structural place
recording which doc belonged to which phase — Phase 2.6 spawned a Stabilization
plan, which itself spawned a QA/coverage strategy doc, all as flat files in
`docs/kb/reference/` cross-linked by hand. The Stabilization plan had also
grown to 1,804 lines, roughly half of it embedded progress narrative crowding
out the forward-looking plan content itself. Carl asked for a real, canonical,
folder-based hierarchy across all four initiatives before more phases branch
further: everything ties back to a thin canonical index, audit trails stay
pure history (referenced, never restated as instructions), and both size
runaway and packet-completion-without-an-audit-entry become CI-gated instead
of relying on convention alone.

Full design rationale, the three deliberate deviations from a structure Codex
independently proposed, and the enforcement-honesty breakdown (what's a hard
CI gate vs. convention) are recorded in the approved plan
(`async-purring-walrus`, referenced in this session) and in
`project_kb_program_index_restructure.md` (Claude Code auto-memory). Key
calls: the four master initiative docs stay flat in `docs/kb/reference/`
(unmoved — they carry 32+ inbound references combined); only phase/execution-
branch docs move into `docs/kb/reference/codebase-optimization/<phase-slug>/`;
`docs/audit-log/` stays completely untouched, flat and chronological.

A real collision was found and handled mid-execution: a separate AI tool
(Codex) had uncommitted work in two worktrees touching some of the exact files
being moved. Work was paused entirely until Carl confirmed Codex's work had
landed (PR #1024), then resumed — `git merge origin/main` into this branch
completed with zero conflicts, since git's rename detection correctly folded
Codex's edits into the new file locations.

## Implementation

- Moved 8 files via `git mv` (7 original phase/execution-branch docs, plus
  Codex's new P3-A characterization doc merged mid-restructure) into
  `docs/kb/reference/codebase-optimization/{phase-2-6-stabilization,phase-3,
  cross-cutting}/`, dropping the now-redundant date suffix each carried.
- New `docs/kb/reference/program-index.md` — thin canonical glue: status,
  current phase/packet, dependencies/gates between the four initiatives,
  links to each master doc's real (unmoved) path, an "Active work" table
  (one row per initiative) for parallel-work visibility.
- Extracted embedded progress narrative verbatim (two parallel background
  Agent passes, "verbatim move, no summarization," spot-checked afterward)
  into new sibling `progress-log.md` files: the optimization plan's own
  §22 + top blockquotes → `codebase-optimization-plan-progress-log.md`
  (flat sibling, master doc itself didn't move); the stabilization plan's
  `## Progress log` section + embedded packet-level "done" paragraphs →
  `codebase-optimization/phase-2-6-stabilization/progress-log.md`. Trimmed
  the two source docs 1572→1155 and 1813→~701 lines respectively.
- Added a standard packet/phase-doc header (Parent plan / Program index /
  Status / Owner / Scope / Dependencies / Exit criteria / Evidence / Audit
  entry) to all 4 master docs, all 8 moved/new phase docs, and
  `execution-efficiency-log.md`.
- New `scripts/check-kb-doc-size.mjs` + `.github/workflows/kb-doc-size-check.yml`
  — two-tier line-count ceiling (1,600 master docs / 750 phase-packet docs),
  `progress-log.md`-suffix files and the named `l10-real-bugs-found.md`
  exempt (append-only bug-evidence register, not narrative bloat).
- New `scripts/check-packet-status-audit-gate.mjs` +
  `.github/workflows/kb-packet-audit-gate.yml` — diff-scoped, fails a PR
  where a packet's `**Status:**` field flips to a closed state with no
  correlated new `docs/audit-log/entries/` file and no explicit
  `**Audit entry:** none needed — <reason>` opt-out.
- Updated `docs/kb/pinned/kb-hygiene.md` (new "Program/phase folder
  hierarchy" section + ASCII tree) and `AGENTS.md` (new "Reading order for
  the four tracked initiatives" section + a path fix) so both Claude Code
  and Codex/Cursor read the same convention natively.
- Updated `docs/kb/reference/README.md` (KB Lifecycle Registry) with a
  Program Map pointer and rows/paths for every moved and new file.
- Rewrote all outbound cross-references to the 8 moved files across the
  KB (`client-health-activity-analytics-plan-2026-09-03.md`,
  `l10-real-bugs-found.md`, `qa-baseline-cutover-2026-09-07.md`,
  `2026-09-07-codex-qa-session-handoff.md`,
  `phase-2-5-exit-gate-handoff-2026-09-05.md`, and each moved file's own
  internal relative links for the new directory depth).

## Postflight

- `node scripts/check-kb-links.mjs` — 0 broken (run pre-PR).
- `node scripts/check-kb-doc-size.mjs` — pass (both master docs under 1,600;
  all phase/packet docs under 750, exemptions applied correctly).
- `node scripts/check-packet-status-audit-gate.mjs` — pass (this entry
  itself satisfies the gate for the stabilization plan's own P4-D/P3-A
  status flips landed earlier the same day).
- Confirmed `git mv` (not delete+recreate) used for all 8 moves — history
  preserved, `git log --follow` resolves each new path back through its
  full prior name(s).
- Confirmed no content altered during moves beyond the new header block and
  relative-link path fixes — diffed each moved file against its pre-move
  version.
- Progress-log extraction: confirmed combined line counts of (trimmed
  original + new progress-log.md) account for every line in the
  pre-extraction original, and spot-checked specific dated items (the
  2026-09-08 P4-D #14/#16/#18 paragraphs, the Phase 2.5 batch-history
  section) landed intact in the new progress-log files rather than being
  dropped.
- This PR is docs-only, so `typecheck.yml`/`lint-ratchet.yml`/
  `migration-safety.yml` are skipped under the CI filter shipped the same
  day (`docs/audit-log/entries/2026-09-08-skip-ci-checks-for-docs-only-prs.md`)
  — the two new KB checks above run regardless, since they're path-filtered
  to exactly what this PR touches.
- Not independently verifiable pre-merge: whether Codex actually adopts the
  new structure going forward depends on a separate briefing message sent
  after this PR merges — tracked as a follow-up, not assumed complete here.
