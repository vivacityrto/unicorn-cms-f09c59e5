---
name: fix-and-verify
description: Carry one named, bounded bug/regression fix end-to-end without stopping for check-ins — confirm root cause from source, implement the minimal fix, run mandatory live Playwright verification scoped to the Demo RTO persona (seeding minimal data in Demo RTO only, always cleaning it up afterward), and open one PR — pausing only for the hard gates (PR merge, anything beyond the named regression's scope, a genuine product/policy decision). Use when Carl hands off a bug/regression with language like "proceed with this task", "pursue a goal to fix X", "don't get blocked", "I'll be unattended", or otherwise wants a fix carried to a finished PR on its own.
---

# fix-and-verify — goal-driven regression fix + live verification

A standing rule for one recurring shape of task: Carl names a regression,
says "go fix it and prove it's fixed," and won't be present to answer
questions mid-task. This skill is the general pattern (pursue the goal,
don't stall on ordinary judgment calls) plus the specific procedure
(root-cause from source → minimal fix → mandatory live verification against
Demo RTO → cleanup → one PR).

It is deliberately reusable beyond any single bug — swap in whatever
regression Carl names and the same rules apply. It is *not* for open-ended
feature work, and not for anything whose correct fix depends on an
unresolved product/policy decision (e.g. an item still open in the RBAC v6
§13 / Tenant Operating Model §18 decision matrices, or anything Carl has
explicitly parked) — see "When to stop instead" below.

## The standing rule: goal pursuit vs. hard gates

"Don't get blocked" means: don't pause execution to ask about ordinary
implementation judgment calls, and don't stop mid-task to deliver a status
recap nobody asked for (see the "continue working" convention — brief
inline mentions, not full stops). It does **not** mean overriding this
repo's actual safety rules. Split every decision point into one of two
buckets:

**Pre-authorized by invoking this skill (keep going, don't ask):**
- Any implementation judgment call within the named regression's scope.
- Writing/running tests, reading source, querying live metadata read-only.
- Seeding minimal reproduction/verification data in Demo RTO, and cleaning
  it up afterward.
- Deploying a schema/RLS/RPC/migration change to production via
  `apply_migration` — but **only** when it's required to fix or verify the
  one named regression, tightly scoped (no bundled unrelated changes), and
  paired with its audit entry in the same PR. Carl naming the regression and
  invoking this pattern *is* the "fresh explicit authorization" AGENTS.md
  asks for — for that one scoped change, not a standing blanket grant.
- Opening the PR.

**Never pre-authorized — always a hard stop, even under this skill:**
- Merging the PR. Every session's merge approval is separately scoped per
  AGENTS.md; this skill ends at PR-open.
- Force-push, branch/tag deletion, amending a pushed commit, `git reset --hard`
  outside a just-created branch.
- Any change outside the named regression's scope — resist scope creep even
  when you spot something else broken along the way; note it, don't fix it
  here.
- Touching any tenant's data other than Demo RTO for seeding/verification,
  or leaving seeded data behind uncleaned.
- Reporting a verification step as passed when it didn't actually run
  (blocked tool, missing persona, environment failure) — record it as
  **Inconclusive** with the reason, never a fabricated pass.

**When to stop instead of pushing through:** if confirming the root cause
reveals the correct fix actually depends on a genuine product/policy call —
not an implementation detail — don't guess and implement a policy position.
Document the finding clearly (what's blocked and why), keep making progress
on anything in the task that doesn't depend on it, and surface the open
decision prominently in the final report/PR rather than stalling silently.

## Procedure

1. **Isolated worktree.** Fresh `origin/main`, new worktree, branch named
   per this repo's convention (`hotfix/<slug>` for a bug fix). Never touch
   the shared checkout or another agent's active worktree — check
   `git worktree list` first (see AGENTS.md → "Concurrent agents in a
   shared working directory").
2. **Confirm root cause from source, not the bug report's assumption.**
   Read the actual code/RPC/migration path. If the reported symptom turns
   out to be already fixed, stale, or different from what's described, say
   so plainly — don't invent a fix for a non-bug. Cite exact files/lines.
3. **Flag implications inline, not as a blocking question.** Auth,
   tenant-scope, schema, and production-data implications get called out
   clearly in your running commentary and in the PR description — that
   satisfies "flag before editing" without stopping to wait for a reply.
4. **Implement the minimal, bounded fix.** Prefer a defense-in-depth
   server-side fix over a UI-only guard when the bug is a missing
   authorization/validation check — a hidden button is not a fix if the
   underlying RPC still allows the action directly. Schema/RLS/RPC changes
   get a dated audit entry in the same PR per AGENTS.md.
5. **Mandatory live verification, scoped to Demo RTO:**
   - Use the standing Demo RTO client persona and/or SuperAdmin persona
     (see memory: `reference_demo_rto_client_login`,
     `reference_superadmin_login` — never staff "View as Client" as a
     substitute for a real client-persona check).
   - Follow the existing Playwright/dev-server discipline (see memory:
     `feedback_playwright_dev_server_workflow` — kill any manual `npm run
     dev` in this worktree first, regenerate storage state fresh per
     worktree) and the Phase 2.5/2.6 browser-gate methodology (see memory:
     `feedback_phase25_browser_gate` — authenticated, read-only where
     possible, under the shared heavy-command lock).
   - **If reproducing or verifying the fix needs data that doesn't exist**
     (a second admin contact, a package, a stage, etc.), seed the *minimum*
     needed directly under Demo RTO's own tenant — never another tenant,
     never bulk/synthetic data beyond what's needed. Give seeded rows an
     obviously-temporary, greppable name/marker so cleanup is verifiable.
   - **Always clean up afterward**, and confirm cleanup with a follow-up
     read query — don't just trust the delete call succeeded (see memory:
     `feedback_verification_data_hygiene` — check second-order/trigger
     effects too, e.g. a seeded action firing notifications or timeline
     events, not just the row you inserted). Some effects are
     intentionally immutable (audit trail entries, per AGENTS.md) — when
     something can't be cleaned up because it's meant to be permanent,
     say so explicitly rather than treating it as leftover residue.
   - If verification genuinely can't run (blocked tool, no available
     persona, environment failure), record that step as Inconclusive with
     the reason — don't skip it silently and don't fake a pass.
6. **Standard verification chain** before opening the PR: lint (ratchet),
   typecheck, frontend/Edge tests as applicable — per AGENTS.md's per-PR
   contract.
7. **Open one PR.** Title/description per AGENTS.md conventions: what
   changed and why, root-cause evidence (file:line), migration + audit-entry
   link if applicable, Playwright verification evidence (personas/routes
   exercised, pass/fail/inconclusive), seed-and-cleanup proof, any flagged
   implications, and an explicit "not merged — opening only" note. Stop
   here — do not merge, do not ask to merge.
8. **Signal the checkpoint, don't narrate mid-task.** Once the PR is open
   (or if a genuine stop-instead condition was hit), send one
   `PushNotification` — this is the real checkpoint Carl needs to see while
   away (see memory: `feedback_continue_working_no_pause`). Don't notify
   for routine progress along the way.

## Adapting this for a different regression

Swap in whatever bug/regression Carl names; everything above still applies
unchanged. If a future invocation names a fix that's clearly bigger than
"one bounded regression" (touches multiple features, requires a schema
redesign, or overlaps an open RBAC/Tenant-Operating-Model decision), treat
that as a "when to stop instead" case rather than forcing this skill's
single-PR shape onto it — say so, and ask how Carl wants it scoped before
proceeding at that larger size.
