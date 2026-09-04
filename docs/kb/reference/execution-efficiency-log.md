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
| 5 | [#557](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/557) | *(pending — added in next batch's entry)* | | 38 (`MeetingSummaryCard.tsx` 14, `RockFormDialog.tsx` 14, `RockProgressControl.tsx` 1, `QuarterlyRocksSection.tsx` 8, `RockCard.tsx` 1) | Deliberately sequenced right after batch 4 to reuse the still-warm `EosRock`/`EosMeetingSummary` schema context — largest single-batch finding count so far, worth watching whether the next batch's cycle time confirms the reuse effect held. |

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
