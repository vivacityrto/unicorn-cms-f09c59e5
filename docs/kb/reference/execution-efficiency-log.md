# Execution efficiency log

Companion to `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`'s
efficiency-checkpoints practice (see also the portable Builder Manifest,
`unicorn-workspace/BUILDER-MANIFEST.md` §6) — but that document is
*principles* (how to work); this one is *data* (what actually happened).
Requested 2026-09-04 by Carl explicitly for "insights, metrics and analytics
as basis for improvement," spanning every active plan execution in this
repo — codebase optimization, RBAC v6, the tenant operating model, and
client health metrics — not just one of them.

**Why a separate file instead of folding this into the plan doc or the
manifest:** the plan doc tracks *what* shipped (one row per candidate); the
manifest teaches *how* to work; this file is the only place that answers
"was the last efficiency change actually faster, and by how much" with real
numbers instead of narrative recollection. Keep it machine-checkable where
possible (real timestamps, real line counts) rather than estimated.

## How to read the numbers

- **Cycle time** = time between this batch's merge and the previous batch's
  merge (from `gh pr view <N> --json mergedAt`), not "time I spent typing."
  It includes investigation, fix, verification, PR creation, and merge —
  the full loop. Two adjacent batches' cycle times aren't perfectly
  separable (an idle gap before starting batch N shows up in batch N's own
  number, not the prior one), so treat this as a trend indicator, not a
  precise per-batch budget.
- **Verification duration** = the actual `Duration:` line from the tool
  output of the slowest verification step, when captured. Not always
  captured in every session — blank means not recorded, not zero.
- Findings/errors deltas come from `docs/kb/reference/lint-baseline.json`,
  regenerated and compared before/after every batch — never estimated.

## Codebase optimization plan — `react-hooks/exhaustive-deps` phase (closed)

| Batch | PR | Merged (UTC) | Cycle time | Findings fixed | Notes |
|---|---|---|---|---|---|
| 18 (final, 4 commits) | [#550](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/550) | 2026-09-04 00:38:54 | — (phase-closing batch, no same-phase predecessor in this log) | 42 (38 files) | Consolidated the entire remaining scattered backlog into 1 PR / 4 commits instead of ~40 micro-PRs. Reused one worktree across all 4 commits; ran typecheck/test:frontend/test:edge in parallel per commit rather than sequentially. |

## Codebase optimization plan — `no-explicit-any` phase (in progress)

| Batch | PR | Merged (UTC) | Cycle time | Findings fixed | Notes |
|---|---|---|---|---|---|
| 1 | [#551](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/551) | 2026-09-04 01:08:42 | 29m48s | 24 (`src/types/eos.ts` 22, `audit.ts` 1, `eosAlerts.ts` 1) | First batch of a new finding category — cycle time includes standing up the methodology itself (checking real consumers, reading the actual RPC/migration SQL for authoritative shapes, discovering the `Record<string, unknown>` vs `Json`-for-RPC-params pitfall) on top of the fix. Expect batch 1 of any new category to run slower than steady-state. |
| 2 | [#552](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/552) | 2026-09-04 01:23:12 | 14m30s | 2 (`src/types/qc.ts` 1 + sibling in `useQuarterlyConversations.tsx`) | **51% faster than batch 1** with the methodology already established — same investigation pattern (grep consumers, check real write-side shape, cast at read sites) applied directly with no re-derivation. Smaller batch (2 vs 24 findings) also contributed, so this isn't a clean per-finding rate comparison, but the qualitative signal (methodology reuse compounds) is real. |
| 3 | [#555](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/555) | 2026-09-04 01:46:55 | 23m43s | 15 (`src/hooks/useEosConfigurations.tsx`) | A different pattern from batches 1-2 (client-level `(supabase as any)` casts, not JSON-field casts) — cycle time reflects standing up a second sub-methodology (confirm table exists in generated schema before removing a cast) rather than reuse of batch 1-2's pattern directly. |
| 4 | [#556](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/556) | 2026-09-04 02:15:45 | 28m50s | 24 (`useEos.tsx` 12, `useEosOptions.ts` 12) | Deepest investigation of the phase so far — surfaced 3 real dead-code bugs (tenant_id silently dropped before insert, same class already fixed once elsewhere in the file) and 2 real stale-type bugs (a string-union arm no caller uses, a phantom field with no DB column), all confirmed via direct schema queries before editing. Slower than batch 3 despite methodology reuse because the investigation depth (not the fix mechanics) was the bottleneck — a reminder that cycle time tracks total complexity, not just "have we seen this pattern before." |
| 5 | [#557](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/557) | 2026-09-04 02:46:30 | 30m45s | 38 (`MeetingSummaryCard.tsx` 14, `RockFormDialog.tsx` 14, `RockProgressControl.tsx` 1, `QuarterlyRocksSection.tsx` 8, `RockCard.tsx` 1) | Deliberately sequenced right after batch 4 to reuse the still-warm `EosRock`/`EosMeetingSummary` schema context — largest single-batch finding count so far. Cycle time held roughly flat vs. batch 4 (30m45s vs 28m50s) despite more findings — reuse offset the larger scope. |
| 6 | [#558](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/558) | 2026-09-04 03:30:31 | 44m01s | 71 across 22 files (all EOS: `LiveMeetingView.tsx` 10, `useEosHealth.tsx` 8, `useEosSegueShares.tsx` 7, `useEosAgendaTemplates.tsx` 6, `ApplyTemplateDialog.tsx` 5, `QCSectionCard.tsx` 4, `MeetingScheduler.tsx` 3, `useEosConfigMeetingActions.tsx` 3, `useEosReadiness.tsx` 3, `useEosDrafts.tsx` 2, `useEosRocksHierarchy.tsx` 2, `QCScheduler.tsx` 2, plus 10 files with 1 each) | Full sweep of every remaining EOS `any` finding in one PR — closes the EOS cluster entirely. Found and fixed a second live bug this phase (see plan doc): `useEosHealth.tsx`'s rocks query never selected `seat_id`, so the Health Score's Rocks-discipline dimension always treated every rock as seat-less regardless of the real value (verified via direct SQL: 4 of 42 current-quarter rocks do have a seat). Also found two stale hand-written types that undersold real DB nullability (`EosConfiguration.facilitator_seat_id`/`visionary_seat_id`/`integrator_seat_id` were `string \| undefined`, DB columns are `string \| null`) and one stale "types.ts not regenerated" comment in `useEosMeetingSegments.tsx` next to an RPC (`go_to_previous_segment`) that has in fact been in generated types for a while — same class of drift as batch 4's stale-type findings. A third real bug was found via typecheck fallout, not the initial `any` sweep: `useEosHealth.tsx`'s People System dimension queried 4 nonexistent `eos_qc` columns and had been silently 400ing (always scoring 0) since it was written — rewritten against the real `quarter_start`/`quarter_end`/`eos_qc_signoffs` schema. `ImportVideosPanel.tsx` (2 findings, `src/components/academy/builder/`) deliberately deferred — out of EOS scope, candidate for the next academy-focused batch. Cycle time (44m01s) is the longest of the phase so far, reflecting the depth of the People System investigation, not the mechanical fix time. |
| 7a | [#560](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/560) | 2026-09-04 04:03:59 | 33m28s | 39 across 7 files, `src/hooks/academy` sub-batch 1/2 (`useAcademyWorkbooks.ts` 1, `useEnrolCourse.ts` 1, `useAcademyTagManagement.ts` 2, `useMyEnrolledCourses.ts` 6, `useAcademyCourseResources.ts` 7, `useAcademyPackageRules.ts` 9, `useAdminAcademyCourses.ts` 13) | First batch of a new directory cluster (`src/hooks/academy`, 153 findings total, 12 files) — took the smaller/medium files first. One new fallout pattern not seen in EOS batches: Supabase's typed `.update()` builder uses a `RejectExcessProperties` conditional type that rejects a variable whose *declared type* includes a property incompatible with the target (here, `AdminCourse.id: number` clashing with the DB's `id?: never` on Update) — fixed by typing the update payload as `Partial<Omit<AdminCourse, 'id' | 'module_count' | 'lesson_count' | 'enrollment_count'>>` instead of `Partial<AdminCourse>`. Remaining 114 findings across 5 files queued as 7b. **Also fixed a process gap this batch:** `lint-baseline.json` hadn't actually been regenerated/committed since batch 5 — batch 6 and the caching PR both merged without it, so this table's batch-6 "3679→3641" note above is a narrative estimate, not a verified one. Regenerating showed batch 5 truly ended at 3634 (not 3641 — a small unexplained drift, likely unrelated concurrent work) and batch 7a ends at 3530. Committed the real baseline file in 7a's PR; every batch from here regenerates and commits it instead of hand-computing deltas. |
| 7b | [#561](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/561) | 2026-09-04 04:28:18 | 24m19s | 114 across 5 files, `src/hooks/academy` sub-batch 2/2 (final) — `useTenantAcademyAccess.ts` 14, `useAcademyCertificates.ts` 15, `useAcademyAssessmentBuilder.ts` 19, `useAcademyModulesLessons.ts` 19, `useAcademyEnrollments.ts` 48 (plus 1 required fallout fix in `LessonEditorPanel.tsx`, outside this batch's own directory scope) | Closes out `src/hooks/academy` entirely (153/153 findings across both sub-batches). Consistently used `Partial<Omit<Interface, 'id'|...>> & {requiredField}` against each file's own existing interface for update/create payloads, rather than a bare `Record<string, any>` — this is what caught the `LessonEditorPanel.tsx` fallout (a bare `Record<string, any>` structurally can't prove a required field is present, so TS correctly rejected the stricter target type once the hook's own signature stopped accepting `any`). Baseline dropped 3530→3415 (115, confirmed via regenerated + committed `lint-baseline.json`, now standard practice every batch per 7a's process fix). Verified live via Playwright (SuperAdmin): course builder Structure/Assessment tabs, a real "Create Assessment" click end-to-end through the retyped mutation (verified via SQL, then deleted — zero residue), and the Enrolments admin page rendering all 660 real enrolments with correct stats — zero console errors throughout. **Fastest cycle time of the phase so far** — same directory family (`src/hooks/academy`) as 7a, methodology fully warm. |
| 8a | [#562](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/562) | 2026-09-04 04:47:46 | 19m28s | 42 across 9 files, `src/hooks/useStage*` sub-batch 1/? — `useStageCertification.tsx` 1, `useStageVersions.tsx` 2, `useStageEmails.ts` 4, `useStageActiveUsage.tsx` 5, `useStageAuditLink.ts` 5, `useStageAuditLog.tsx` 5, `useStageReviews.tsx` 6, `useStageDocuments.ts` 7, `useStageReleases.tsx` 7 | First batch of a new directory family (`src/hooks/useStage*`, 182 findings, 17 files) — the package/stage-builder feature area, chosen as the natural next cluster once `src/hooks/academy` was fully closed. Took the 9 smallest files first, same as 7a's approach. **Found a real live bug**: `useStageActiveUsage.tsx` queried a nonexistent `tenants.tenant_id` column (real PK is `id`) behind a `(supabase as any)` cast — every call has 400'd silently since the hook was written, so the "active clients" widget has always shown `Tenant #<id>` placeholders instead of real names. Baseline dropped 3415→3373 (42 targeted, confirmed via regenerated + committed baseline). Verified live via Playwright (SuperAdmin): `/admin/stages/5` Documents tab (real sync status, 5 template documents) and Audit Log tab (correct empty state) — zero console errors. **New fastest cycle time of the phase** (19m28s vs. 7b's 24m19s) — the smallest-9-files-first approach plus fully-warm methodology on a brand-new directory family. |
| 8b | [#563](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/563) | 2026-09-04 05:37:44 | 49m58s | 140 across 8 files, `src/hooks/useStage*` sub-batch 2/2 (final) — `useStageTemplateContent.tsx` 34, `useStageAnalytics.tsx` 22, `useStageExportImport.tsx` 21, `useStageDuplication.tsx` 18, `useStageSimulation.tsx` 14, `useStageReplacement.tsx` 14, `useStageDependencies.tsx` 9, `useStageQualityCheck.tsx` 8 | Closes out `src/hooks/useStage*` entirely (182/182 across both sub-batches). Took the larger/remaining files, unlike 7a/8a's smallest-first pattern, since the cluster was small enough (8 files) to just work through in one pass. **3 fallout fixes required post-mechanical-sweep** (typecheck failed after the initial `any` removal, all 3 real, none papered over): a `RejectExcessProperties` "Property 'id' is missing" error in both `useStageDuplication.tsx` and `useStageExportImport.tsx` (see the plan doc's real-bug note — `stages.id` genuinely has no DB default), and a TS2589 "excessively deep" error in `useStageSimulation.tsx` on a nested-embed select — new fix pattern: pass the result type as `.select<QueryString, ResultType>()`'s explicit second generic argument instead of casting the result afterward (casting the result doesn't work; the error is in the query builder's own inference, before any cast applies). Found and fixed one real live bug (`useStageAnalytics.tsx`'s High-Risk Stages widget, wrong audit-log column) and documented-but-left two more (email-copy schema mismatch, the `stages.id` bug affecting two files) — see plan doc for full detail on all three. Baseline dropped 3373→3233 (140 targeted, confirmed via regenerated + committed baseline). Verified live via Playwright (SuperAdmin): `/admin/stages`, `/admin/stages/6` (all tabs), `/admin/stage-analytics` High Risk tab — network log confirms the rewritten query returns 200 (was silently failing pre-fix), zero console errors across 89 captured messages. |
| 9a | [#566](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/566) | 2026-09-04 06:11:13 | 33m29s | 58 across 27 files, `src/components/client` sub-batch 1/? — smallest files first (1-4 findings each) | First batch of a new cluster after a fresh full-repo `npx eslint 'src/**/*.{ts,tsx}'` ranking pass (both `src/hooks/academy` and `src/hooks/useStage*` now fully closed) — `src/components/client` is by far the largest remaining concentration: 350 findings, 44 files, ~2x the size of `useStage*`. Overwhelmingly mechanical this batch: `catch (err: any)` → `instanceof Error` narrowing dominated the findings, plus dropping `as any` casts on tables already in generated types. Two more TS2589 nested-embed errors hit and fixed with the same `.select<QueryString, ResultType>()` pattern from batch 8b — confirms that fix generalizes rather than being a one-off. No new bugs found (first batch this phase with a clean bill of health — see plan doc). Baseline dropped 3233→3175 (58 targeted, confirmed via regenerated + committed baseline). Verified live via Playwright (SuperAdmin) against a real client on the staff Client Detail page (Overview/Time/Action Items/Audits/Emails/Users/Integrations/Packages/Documents tabs + 4 dialogs) — zero console errors across ~180 messages. `ClientTopbar.tsx` (client-portal side) not covered this pass, see plan doc. 293 findings remain in this cluster. |

## RBAC v6

*(No batches logged yet under this initiative as of this file's creation.
Add rows here as work resumes — see `project_rbac_security_remediation_2026_08_26`
in session memory for prior context.)*

## Tenant operating model

*(No batches logged yet under this initiative as of this file's creation.)*

## Client health metrics

*(No batches logged yet under this initiative as of this file's creation.)*

## Efficiency changes tried, with measured effect

Distinct from the batch log above — this table is specifically for
*process* changes (not fixes), so a proposed efficiency change can be
checked against real before/after data rather than assumed to have worked.

| Date | Change | Measured effect | Where |
|---|---|---|---|
| 2026-09-01 | `tsconfig.app.json`/`tsconfig.node.json` gained `incremental: true` + explicit `tsBuildInfoFile` | Cold run ~2m45s → warm run ~15s (~11x) on repeat `npm run typecheck` invocations, identical result | PR #548 |
| 2026-09-04 | Consolidated ~40 scattered single-file lint findings into 1 PR (4 commits) instead of ~40 micro-PRs | Avoided ~39 redundant worktree-setup + PR-review + merge cycles; exact time saved not measured (no baseline of the un-consolidated approach to compare against) | PR #550 (batch 18) |
| 2026-09-04 | `scripts/seed-tsc-cache.mjs`: copy `.tsbuildinfo` from the main checkout/a sibling worktree into a fresh worktree before its first typecheck, instead of leaving every new worktree to pay a full cold compile | See "TS cache seeding — baseline and milestones" below. Not yet adopted as a standing step in the batch/PR cycle — tracking real data across the next several worktrees before promoting it from "tried" to "practice." | `scripts/seed-tsc-cache.mjs`, Builder Manifest §6 |

### TS cache seeding — baseline and milestones

Added 2026-09-04 in response to a direct ask: "have a baseline and then
we'll see" before trusting this as a real improvement, not just a plausible
idea. The safety claim (seeding cannot produce a wrong typecheck result,
only a cache miss) is argued from how `tsc --incremental` works and was
spot-checked once (see Builder Manifest §6) — the timing claim is separate
and explicitly **not yet trusted**, because the two trials so far disagree
by nearly 6x on this machine (limited RAM, shared with whatever else is
resident — see AGENTS.md's own note on typecheck duration variance).

**Baseline (no seeding, this repo, 2026-09-04):** a genuinely cold
`npm run typecheck` — empty `node_modules/.cache/tsc/` — took **99.6s** in
the `any-retirement-batch6` worktree (25 changed files vs. `origin/main`).

**Seeded trials, same worktree, same diff, cache copied from the main
checkout each time:**
| Trial | Duration | Notes |
|---|---|---|
| 1 | 8.7s | Ran immediately after several unrelated typechecks in the same worktree this session — OS/disk cache likely still warm from that, not just the seeded `.tsbuildinfo`. |
| 2 | 54.2s | Cache cleared and reseeded fresh immediately before this run, no intervening activity. Still ~46% faster than the 99.6s cold baseline, but far short of trial 1. |

**Reading this honestly:** both seeded trials beat the cold baseline, so
the mechanism has *some* real effect, but the size of that effect on this
machine is currently unmeasurable with confidence — the variance between
trial 1 and 2 is larger than the effect being measured. Do not quote "12x"
or "2x" as a settled number from this data.

**Milestones before promoting this from "tried" to a standing §2 step:**
1. Collect 3 more real before/after pairs across genuinely separate
   worktree creations (not repeated trials in one still-warm worktree) —
   ideally spanning different times of day / different concurrent system
   load, to see whether the variance is load-driven or something else.
2. In every one of those pairs, confirm the seeded run's typecheck
   **result** (error count, specific errors) is byte-identical to a cold
   run's result on the same file state — this is the actual thing that
   must never regress, independent of timing.
3. If the seeded median across those runs is consistently faster than cold
   (even if the exact multiple varies), add `node scripts/seed-tsc-cache.mjs`
   as a standing step in Builder Manifest §2 (worktree setup, right after
   `npm install`). If it's a wash or the variance swallows the effect,
   record that finding here too — a tried-and-inconclusive result is still
   worth keeping so it isn't re-tried blind later.

## Adding a new entry

1. After a batch merges, run `gh pr view <N> --json mergedAt` for this
   batch and the previous one in the same phase/initiative to compute
   cycle time.
2. Pull the findings-fixed count from the `lint-baseline.json` diff (or
   the equivalent metric for a non-lint initiative).
3. Add one row to the relevant initiative's table. If the initiative has
   no table yet, add one following the same column shape.
4. If a deliberate efficiency change was tried this batch, add a row to
   "Efficiency changes tried" too — even a null result ("tried X, no
   measurable difference") is worth recording so it isn't re-tried blind
   next time.
