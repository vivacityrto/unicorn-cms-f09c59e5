# Audit: 2026-04-24 — KB Restructure

**Trigger:** workflow optimisation session
**Scope:** entire KB architecture. Redesigned the relationship between
claude.ai Project, `unicorn-kb/` repo, `unicorn/` codebase repo, Claude
Code, and Lovable. Produced a three-repo architecture and migrated the
KB into it.

---

## Findings

- The flat 13-file KB structure (`NN-*.md` at the root of one folder)
  assumed the entire KB was always pinned. With ~2,500 lines pinned into
  every chat, signal density was degrading and context budget was being
  spent on content most chats didn't need.
- No handoff documentation existed. Rituals between claude.ai, Claude
  Code, and Lovable were implicit, inconsistent between people, and
  invisible to newcomers.
- No audit trail existed — KB changes, reconciliations, and post-Lovable
  events were not recorded separately from ordinary commits. "What was
  the state of the world when I made this call" was not answerable.
- `12-context-hygiene.md` opened with *"This Project lives only inside
  Claude Projects — there's no git repo mirroring it"* — doubly wrong
  once a KB repo existed and GitHub MCP was connected.
- The team's tool access pattern (Angela/RJ/Khian use Claude Code; others
  are chat-only; non-technical stakeholders need a proposal path) was
  implicit and unaddressed.
- Initial design placed as-shipped state docs (module-status, codebase-map,
  architecture) in `unicorn/docs/`. Rejected because Lovable controls
  `unicorn/` and those files would be vulnerable to Lovable editing,
  deleting, or referencing them incorrectly. Moved to
  `unicorn-kb/codebase-state/` instead, with a Reflects-commit SHA
  discipline to detect staleness.

---

## KB changes shipped

- `unicorn-kb@<SHA>` — _(fill in after the restructure PR merges)_.
  Changes include:
  - New folder structure: `pinned/`, `reference/`, `codebase-state/`,
    `handoffs/`
  - Renamed all files to kebab-case descriptive names (prefix dropped)
  - Full rewrite of `pinned/kb-hygiene.md`
  - New pinned file: `pinned/team-roles.md`
  - New reference file: `reference/source-precedence.md`
  - New folder: `codebase-state/` (README + migrated module-status,
    codebase-map, architecture — regenerated against current `unicorn/`
    HEAD rather than blind-copied)
  - Six new handoff files in `handoffs/`
  - `pinned/decisions.md` restructured as index; full ADRs consolidated
    in `reference/decision-trail.md`
  - Updated all cross-references

No changes to `unicorn/` repo — intentionally, to keep Lovable's surface
area clean.

---

## Codebase observations (read-only)

- `unicorn@<SHA at time of codebase-state regeneration>` — the HEAD SHA
  used to generate the initial `codebase-state/*` files.

---

## Decisions

- Three-repo architecture adopted: `unicorn/` (codebase, Lovable), `unicorn-kb/`
  (team KB including codebase-state), `unicorn-audit/` (Angela's audit
  trail). Full ADR to draft in `unicorn-kb/reference/decision-trail.md`.
- Pinned vs fetched split adopted. Pinned = stable opinion; fetched =
  reference + codebase-state + handoffs. Routing lives in
  `reference/source-precedence.md`.
- `codebase-state/` lives in `unicorn-kb/` (not `unicorn/`) to keep
  Lovable out of the documentation loop. Trade-off: requires manual
  regeneration ritual after Lovable changes.
- Reflects-commit SHA discipline for `codebase-state/*` files — the SHA
  in each file's header is the mechanism for staleness detection.
- Non-technical proposal inbox = a designated claude.ai chat thread.
  Write-only. Angela is recipient.
- Audit cadence = ad-hoc. Drift-surfaced or post-remix, not calendar.
- Claude Code users, for now: Angela, RJ, Khian.
- New Claude Project stood up from scratch; old project frozen as archive
  (not modified in place, to avoid dead citations in chat history).

---

## Open questions parked

- Will Claude reliably honour the "fetch reference/* and codebase-state/*
  via MCP on demand" rule in practice? Needs monitoring over the first
  month. Fallback: promote specific files back to pinned/ if MCP routing
  proves unreliable.
- Is the pinned set actually the right 6 files, or will one of the
  `reference/` files get promoted back up once we see what questions the
  team asks most?
- When the first Lovable remix happens post-restructure, will
  `post-lovable-remix.md` survive first contact, or need revision?
- Does `handoffs/claude-project-to-claude-code.md`'s "handoff summary"
  prompt produce useful output, or do we need to tune it?
- The inbox thread URL doesn't exist yet — create it, pin the URL in
  `handoffs/non-technical-proposal.md` and team comms.
- Will the Reflects-commit SHA discipline hold in practice, or will
  people forget to update it on feature-ship refreshes? First few
  `lovable-to-codebase.md` runs will tell us.

---

## Tag

`audit-2026-04-24`
