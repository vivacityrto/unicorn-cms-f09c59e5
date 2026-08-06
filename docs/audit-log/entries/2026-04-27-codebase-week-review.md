# Audit: 2026-04-27 — Codebase Week Review (2026-04-20 → 2026-04-25)

**Trigger:** ad-hoc (Carl-requested week-in-review on `<codebase>`)
**Scope:** read-only review of `unicorn-cms-f09c59e5` commit history for
the seven days ending 2026-04-25. No KB or codebase edits made. Goal
was to surface themes, risk-bearing changes, and items future-me should
be able to find via `git log --grep="audit:"`.

> **⚠️ Errata — see [Errata](#errata) section at the bottom.** Two
> findings below were drafted from commit messages and diffstats only;
> when those claims were checked against actual file contents at HEAD
> while preparing `unicorn-kb` PR #10, two of them did not survive
> contact with the code. The original text is preserved below for
> audit-trail integrity; corrections are appended at the end.

---

## Findings

- **Volume:** 142 commits in the window, all authored by
  `gpt-engineer-app[bot]` (Lovable). Net diff
  `ee6cb611^..cf8d1314` = 55 files changed, +6,186 / −583 lines, across
  ~30 distinct Lovable sessions (each session: "Save plan in Lovable" →
  N× "Changes" → one named final commit).
- **Audit module was the dominant theme** — roughly half the named
  commits. Both new surface (preliminary flow, completion %, risk
  rating, combined card, edit + richer summary, today's-date in
  calendar) and substantive correctness fixes (autosave data loss,
  ownership RLS, audit creation routed through an Edge Function).
- **Multitenancy / RLS hardening landed alongside the audit work.**
  Phantom tenant column removed; tenant resolution logic fixed;
  admin-RPC overhaul (largest backend change of the week). Three new
  Supabase migrations shipped — two on 2026-04-21, one on 2026-04-23.
- **One full revert on 2026-04-20** (`084a5e17` — "Reverted to commit
  9e51603fd6081fb7515a5cf3b196ffa54c60a125"). The reverted commit
  predates this window; reason not captured in commit message. Worth
  checking what was rolled back if anything still feels off.
- **Audit autosave data-loss fix** (`a0dccf19`, 2026-04-23) is the
  most consequential correctness change of the week given Angela's
  workflow depends on autosave. Worth verifying in practice before
  trusting it silently.
- **Architectural shift:** audit creation moved from client-side RPC
  to a Supabase Edge Function (`65c426aa`, 2026-04-20). Not yet
  reflected in `unicorn-kb/codebase-state/`.
- **Catalog / integrations work** also progressed: Vimeo SDK viewer
  (`847ceb14`), SharePoint folder button (`c32d9a60`), package-course
  rules UI (`6c1cdba6`), duplicate-package guard (`1ce4b026`), inline
  RTO add inside Integrations (`f8dd129c`).
- **Onboarding UX:** smart-paste invite (`cd07cb79`), invite-dialog
  hint (`335f0c6b`), reset-flow bug fixes (`78447f47`).
- **Naming polish:** "Purchasing RTO" → "Purchaser" rename
  (`70c52c22` + label fix `4187aafa`). Worth a grep across
  `unicorn-kb/` to confirm no doc still uses the old label.
- **No human commits in the window.** Confirms the codebase remained
  Lovable's territory for the entire period — workspace-root rule held.

---

## KB changes shipped

- No changes. Read-only audit.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ cf8d1314` — HEAD at end of window.
  ("Added risk rating UI", 2026-04-25 01:53:08 UTC).
- `unicorn-cms-f09c59e5 @ ee6cb611` — earliest commit in window
  ("Save plan in Lovable", 2026-04-20 06:55:47 UTC).
- Notable named commits (Lovable session terminals):
  - `65c426aa` — Routed audit creation to Edge Function
  - `b76cfc96` — Fixed audit ownership RLS
  - `1939b225` — Removed phantom tenant col.
  - `084a5e17` — Reverted to commit 9e51603fd6081fb7515a5cf3b196ffa54c60a125
  - `78447f47` — Fixed reset flow bugs
  - `acac12c6` — Added combined audit card
  - `6671816d` — Fixed client dropdown loading
  - `f8dd129c` — Added RTO add-inline in Integrations
  - `847ceb14` — Implemented Vimeo SDK viewer
  - `6c1cdba6` — Added package-course rules UI
  - `faafacb2` — Added admin RPCs & overhaul
  - `cd07cb79` — Added smart paste for invite
  - `335f0c6b` — Added hint to invite dialog
  - `46ea0b5c` — Enabled today date in audit cal
  - `a0dccf19` — Fixed audit autosave data loss
  - `50b7cb58` — Fixed tenant resolution logic
  - `c32d9a60` — Added SharePoint folder btn
  - `c714983f` — Fixed notes/emails width
  - `1ce4b026` — Added duplicate package guard
  - `72ae466e` — Added preliminary audit flow
  - `c337d624` — Added audit completion pct
  - `1dd1f7bd` — Added edit & richer summary
  - `5eb772f4` — Trimmed email to mid-length
  - `70c52c22` — Renamed "Purchasing RTO" to "Purchaser"
  - `4187aafa` — Fixed Purchasing RTO label
  - `cf8d1314` — Added risk rating UI
- New Supabase migrations in window:
  - `supabase/migrations/20260421082533_da37ce62-…sql`
  - `supabase/migrations/20260421085406_b2a157f8-…sql`
  - `supabase/migrations/20260423093423_781c87e1-…sql`
- File-touch concentration: `src/components/` (30 sub-paths),
  `src/pages/` (6), `src/hooks/` (5), `supabase/migrations/` (3),
  `supabase/functions/` (1).

---

## Decisions

- n/a. No ADR drafted, resolved, or superseded.

---

## Open questions parked

- **Audit creation Edge Function** (`65c426aa`) is not yet reflected
  in `unicorn-kb/codebase-state/`. Next `lovable-to-codebase.md` run
  should capture: name of the Edge Function, what it does that the
  prior client-RPC path didn't, and whether the Reflects-commit SHA
  in the relevant codebase-state file needs bumping.
- **Admin RPCs overhaul** (`faafacb2`) — same gap. Worth a focused
  look at the migration on 2026-04-21 plus the RPC surface to update
  whichever codebase-state file documents admin operations.
- **The 2026-04-20 revert** (`084a5e17`). Reverted SHA
  `9e51603fd6081fb7515a5cf3b196ffa54c60a125` is upstream of this
  window. Not investigated. If any current bug feels like
  "something used to work," start here.
- **Audit autosave fix verification.** The fix landed
  (`a0dccf19`) but I have no signal on whether anyone has run a real
  audit through it since. Carl/Angela should confirm before relying
  on it.
- **"Purchasing RTO" → "Purchaser" rename.** A grep across
  `unicorn-kb/` for the old label would close the loop. Not done in
  this session.
- **`audit/` vs `audits/` directory naming.** On-disk reality is
  `audit/` (singular) — both this file and the prior
  `2026-04-24-kb-restructure.md` live there. But `unicorn-audit/README.md`,
  `unicorn-audit/CLAUDE.md`, and the link in `INDEX.md` all use
  `audits/` (plural), which makes the existing INDEX link a 404.
  Either the docs need updating to match the directory or the directory
  needs renaming. Source-precedence rule favours updating the docs
  (codebase wins). Not actioned this session — not in scope.
- **Sub-repo CLAUDE.md vs workspace-root CLAUDE.md drift.** The
  current `unicorn-audit/CLAUDE.md` instructs "merge the branch into
  main" at session end, while the workspace root forbids pushing to
  main and requires stopping at PR creation. This session followed
  the workspace root (safer, governs cross-repo). The sub-repo
  CLAUDE.md should be reconciled — either restore the PR-based
  session-end ritual or, if the merge-to-main flow is intentional for
  this repo specifically, the workspace root needs to acknowledge the
  exception explicitly.

---

## Tag

`audit-2026-04-27-codebase-week-review`

---

## Errata

Added 2026-04-27, after the original sections were drafted. Surfaced
while grounding `unicorn-kb` PR #10
(<https://github.com/ComplyHub-ai/unicorn-kb/pull/10>) in actual file
diffs rather than commit messages. Original findings retained above
unchanged for audit-trail integrity.

### Correction 1 — "Architectural shift: audit creation moved … to a Supabase Edge Function"

**Original claim** (Findings + "Open questions parked" + Codebase
observations): commit `65c426aa` (2026-04-20 06:56 UTC) routed audit
creation to a new `create-client-audit` Edge Function, and the next
`lovable-to-codebase.md` run should capture this.

**What is actually at HEAD (`cf8d1314`):** the commit
`084a5e17` ("Reverted to commit 9e51603…") on the same day
(2026-04-20 07:58 UTC, ~1 hour later) **deleted the
`supabase/functions/create-client-audit/` directory and reverted the
matching changes to `src/hooks/useClientAudits.ts`**. At HEAD the file
does not exist (`ls supabase/functions/create-client-audit/` →
not-found) and `useClientAudits.ts` does direct
`.from('client_audits').insert(...)` from the client. Audit-mutation
pattern is unchanged from before the window: client-side direct DB
writes via the Supabase JS client.

**Implication for the parked KB-update items:**
- "Audit creation Edge Function … not yet reflected in
  `codebase-state/`" — there is nothing to reflect; the function does
  not exist.
- The architectural-shift framing in the audit summary is wrong. Server
  routing of audit creation remains a greenfield decision, not a
  shipped change.

### Correction 2 — "Multitenancy / RLS hardening landed alongside the audit work"

**Original claim** (Findings, "Open questions parked"): phantom tenant
column removed (`1939b225`), tenant resolution fixed (`50b7cb58`),
admin-RPC overhaul (`faafacb2`), three new Supabase migrations — framed
as a coherent multitenancy / RLS theme.

**What the diffs actually show:**
- `1939b225` "Removed phantom tenant col." — touched only
  `supabase/functions/create-client-audit/index.ts`. That file was
  reverted later the same day (see Correction 1), so this commit is
  effectively a no-op at HEAD.
- `50b7cb58` "Fixed tenant resolution logic" — 8 lines changed in
  `src/pages/NewSuggestionForm.tsx`. UI bug fix in the suggestions
  form, not multi-tenancy plumbing.
- `faafacb2` "Added admin RPCs & overhaul" — Academy-specific. Touched
  `src/components/academy/admin/EnrolmentProgressDrawer.tsx`,
  `NewEnrolmentModal.tsx`, `useAcademyEnrollments.ts`,
  `AcademyEnrolmentsPage.tsx`, `src/integrations/supabase/types.ts`,
  and added migration `20260421085406_b2a157f8-…sql` defining
  `fn_academy_enrollment_stats` and `fn_academy_enrollment_lesson_detail`.
  Both new RPCs gated by `is_vivacity()`. Not a general admin layer
  change.
- The three new migrations are not RLS / tenancy:
  - `20260421082533_da37ce62-…sql` — `fn_academy_rule_dashboard_stats`
    (Academy package-rule dashboard tiles).
  - `20260421085406_b2a157f8-…sql` — Academy enrolments admin RPC pack
    (per `faafacb2`).
  - `20260423093423_781c87e1-…sql` — `fn_package_stream` helper +
    duplicate-stream guard added to `start_client_package`. Packages
    domain.

**Correct rollup of the week's backend work:** two Academy admin RPC
migrations driven by an admin-tooling overhaul of the Enrolments
manager, plus one Packages migration adding a duplicate-stream guard.
No RLS migrations, no general-admin RPC overhaul, no tenancy plumbing
changes that survived to HEAD.

### Items unchanged

The other findings (audit-workspace evolution, autosave fix,
preliminary summary, risk rating, three-phase lifecycle now confirmed
present, catalog/integrations work, onboarding UX, "Purchasing RTO" →
"Purchaser" rename, the 2026-04-20 revert, no human commits in the
window) all hold up against HEAD. `unicorn-kb` PR #10 captures the
audit workspace, Academy admin RPCs, and Packages duplicate-guard
findings into `codebase-state/` directly.

### Process note

Root cause of both errors was reading commit messages + diffstats
without opening the files. For "Routed audit creation to Edge Fn", the
commit message was accurate at the moment the commit was authored — it
just got reverted an hour later, and the audit's window-summary view
didn't catch it. For the multitenancy framing, related-sounding commit
messages got grouped into a theme without verifying any of them
actually changed RLS or tenancy code.

Future codebase-week-review audits should check final on-disk state for
any commit cited as a "shift" or "hardening", not just the commit
message.
