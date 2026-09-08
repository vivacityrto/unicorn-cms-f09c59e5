# Phase 2.6 next-candidate preparation packets

**Parent plan:** [Phase 2.6 Stabilization Plan](phase-2-6-stabilization-plan.md) · **Program index:** [Program Index](../../program-index.md)

Preparation-only follow-up to the task-dialog packet. No runtime or database
changes are included.

## Candidate 2 — title extraction pair — RETARGETED (2026-09-07, Phase 2.6 Packet P6-B)

`extract-note-title` and `extract-suggest-title` are approximately 135 LOC
each with a roughly 12-line behavioral difference, but the required
deployed-caller inventory (never actually done before this candidate was
written up) found `extract-suggest-title` has zero callers anywhere in
`src/` or `supabase/functions/**`, and zero logged invocations. This was not
a live clone pair to consolidate — `extract-suggest-title` was retired
outright (source + `supabase/config.toml` entry removed); `extract-note-title`
is untouched. See the correction note in
`phase-3-5-parallel-preparation-packets-2026-09-04.md`'s Packet D for the
full evidence.

## Candidate 3 — stage quality evaluator — DONE (2026-09-07, Phase 2.6 Packet P6-B)

`useStageQualityCheck.tsx` was approximately 745 LOC with two near-duplicated
evaluation pipelines. Extracted `stageQualityEvaluator.ts`, a pure evaluator
over a typed `StageQualitySnapshot`, leaving hook orchestration, Supabase
reads, tenant/package binding, and UI state in the two original files
unchanged. Added 29 parity fixtures (`stageQualityEvaluator.test.ts`) proving
both pipelines' exact prior behavior, including the two real differences the
original candidate writeup hadn't fully characterized: the hook's generic
email/document fallback pass checks (absent from the certification guardrail
`computeStageQuality`), and the hook-only "certified integrity" self-check.
No RLS, RPC, or schema change — pure frontend extraction.

## Candidate 4 — seat-card presentation core — RETARGETED (2026-09-08, Phase 2.6 stabilization)

This candidate assumed `SeatCard`/`FunctionColumn`/`DraggableSeatCard`/
`DraggableFunctionColumn` were live, consolidatable duplicates. A fresh
reachability trace before starting the "build independent browser coverage"
prerequisite found they are not reachable at all: `/eos/accountability` →
`EosAccountabilityChart.tsx` → `ChartBuilder` renders only `OrgChartView` and
`EosChartGrid`, and neither references any of the four components — seats
are rendered by a separate, independent `EosFunctionCard.tsx`. Zero importers
of the four names exist anywhere in `src/` outside their own cluster (plus
`SwimlaneDragDropProvider.tsx`, their shared dnd-kit context), and no test
references them. Git history shows `EosFunctionCard.tsx` was created the same
day as `FunctionColumn.tsx`, ~14 hours later — an apparent same-day
replacement that was never cleaned up. This was not a live clone pair to
consolidate — the cluster (1,633 LOC across 5 files) was retired outright.
See `l10-real-bugs-found.md`-style evidence in the retirement PR
(`hotfix/retire-dead-seatcard-cluster`). `SeatHealthBadge` and
`SeatCoverageIndicator`, used inside the dead cluster, were kept — both have
independent live callers (`SeatHealthSection`, `SeatDetailPanel`) reachable
from `ChartBuilder`.

## Common gate

These packets remain queued behind Claude's Phase 2.5 exit checkpoint and the
task-dialog cohort. Each implementation gets a fresh worktree, focused parity
fixtures, the full verification contract, authenticated Playwright coverage,
one PR, post-merge documentation, and exact worktree cleanup. Any discovery
that changes RBAC, tenant scope, schema, RLS, RPC, trigger, grant, or Edge
contracts becomes a separately scoped RBAC/tenant vertical slice.
