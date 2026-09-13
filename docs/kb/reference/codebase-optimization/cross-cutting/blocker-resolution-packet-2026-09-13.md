# Cross-initiative blocker-resolution packet — 2026-09-13

> **Status:** decision-ready coordination packet; no decision, credential, hosted run, runtime change, or production action is authorized
> **Inputs:** [Program Index](../../program-index.md), [RBAC P1-l golden-matrix review draft](../../rbac-v6/p1/p1-l-aj-csc-golden-matrix-review-draft.md), [TOM offline QA manifest](../../tenant-operating-model/p0/p0-2-p0-3-offline-qa-fixture-manifest.md), [Client Health H0.3b/c evidence](../../client-health-activity-analytics/h0/h0-3b-3c-forecast-job-disposition-evidence.md), [AdminStageDetail joint ownership matrix](../phase-4/admin-stage-detail-joint-ownership-matrix.md), [remaining gated approval packets](remaining-gated-approval-packets-2026-09-12.md)
> **Owner:** Carl, with product, security, data, operations, consultant, and environment owners named below
> **Scope:** convert the four initiatives' remaining blockers into explicit owner asks and safe next boundaries
> **Audit entry:** none needed — documentation-only planning; no credential, hosted, authorization, schema, deployment, scheduled-job, or live-data action

## Decision boundary

This packet is a handoff for resolving blockers, not a blanket approval. An
approval must identify its row and its scope. Preparation approval permits
source reconciliation, synthetic fixture design, documentation, and a
reviewable implementation packet; it does not authorize runtime, database,
authorization, scheduled-job, hosted-QA, pilot, or production changes.

## Current state and exact blocker asks

| Initiative / gate | Evidence already complete | Exact owner input still needed | Evidence required before the next boundary | Safe stop boundary |
| --- | --- | --- | --- | --- |
| Codebase Optimization — A2 `AdminStageDetail.tsx` | Joint characterization records the call graph, direct Supabase surface, delegated hooks, route guard, and lack of page-level focused tests | Codebase + TOM + RBAC must name the owner for each behavior-bearing area and approve a pure display seam or a specific cross-initiative packet | Ownership map, chosen seam, oracle choice, negative cases, rollback owner | No state/query/mutation/auth/tenant-resolution extraction until ownership and oracle are cleared |
| RBAC — golden capability matrix | P0.1, P1 ledgers, seat/pilot worksheet, shadow contract, source-boundary preparation, and P1-l candidate rows are delivered | Product/security must approve or reject each atomic action, target resource, scope kind, relationship proof, delegability, and unresolved-row disposition | Versioned approved rows, named policy owner, direct boundary evidence, positive/negative probes, review record | No role defaults, grants, evaluator cutover, route/nav gate, RLS, RPC, or Edge change |
| RBAC — R2-e/f AJ/CSC pilot | Candidate seat bundles, minimum read boundary, 14-day shadow contract, mismatch thresholds, and rollback shape are prepared | Product/operations + Carl/Vivacity must name the cohort/resources, personas, pilot owner, rollback owner, telemetry storage/retention/reviewer, and security approver | Approved golden rows, QA personas, named resources, shadow artifact contract, zero-tolerance gates | No pilot enrollment, grant, telemetry/logger deployment, or production observation |
| TOM — T1-x hosted QA | Offline fixture/persona manifest and ghost classifier are prepared; local ghost oracle is 7/7 and offline tests are 10/10 | Carl/environment/security/TOM/operations must confirm QA target, short-lived QA-only identities or explicit unavailable personas, fixture/reset approval, operator/window, and private artifact owner/retention | Completed preflight form, approved synthetic fixture, storage states, cleanup and residue-verification plan | No credential creation/use by this task, Supabase connection, fixture write/reset, migration sync, or hosted query |
| TOM — T2 implementation | P0.1 source-of-truth, identity, view/RPC/write graph, and owner-disposition directions are complete | Carl/product/data/security must name one exact object or writer, canonical source, canary fixture, negative case, rollback, and audit owner | Contract-specific implementation packet and audit entry | No schema, RLS, RPC, trigger, Realtime, normalization, membership, or production change |
| Client Health — H2 forecast jobs | H0.3b/c source/live-schema, caller/consumer, and deployed-state evidence is complete; jobs have no cron/history/output activity and have material source mismatches | **Approved 2026-09-13:** retain as evidence, keep stopped, and keep consumers unavailable. A replacement-shadow packet would require separate authorization. | Recorded owner disposition; any replacement path needs data owner, synthetic inputs, versioned run ledger, shadow/rollback contract | No restart, repair, deletion, backfill, cron change, or replacement deployment |
| Client Health — H3 consultant input | Research pack defines the safe input format and explicitly excludes identifiable client material | **Acknowledged by Carl 2026-09-13:** AJ/Ezel/consultants + Carl must provide consolidated operational reports | Reports on cadence, blocker ownership, intervention patterns, quiet/data-insufficient cases, and pilot usefulness | No health thresholds, confidence semantics, cohort selection, score, or pilot acceptance inferred from repository/live data |

## Suggested resolution order

1. H2 disposition is recorded: retain the functions/tables as evidence, keep
   jobs stopped, and keep consumers unavailable. A replacement requires a new
   separately authorized packet.
2. Supply the consultant reports for H3. They are the missing operating input
   for Client Health metric definitions and cannot be replaced by technical
   proxies.
3. Review RBAC P1-l row by row, leaving unknown actions unresolved rather than
   granting a broad role. The first implementation candidate should be the
   smallest read-only AJ/CSC boundary with named scope and direct negative
   probes.
4. Complete TOM hosted-QA preflight only after the QA identity, fixture,
   operator, and artifact fields are explicitly supplied. The offline
   artifacts are ready; hosted execution is not.
5. Resolve `AdminStageDetail.tsx` ownership only after the TOM/RBAC/Client
   Health crosswalk identifies whether a behavior-bearing seam belongs to an
   existing initiative. Pure display-only work can be considered separately
   with compiler proof.

## What can proceed unattended

- Keep the RBAC candidate matrix and TOM relationship crosswalk synchronized.
- Refine synthetic positive/negative cases and the QA runbook without real
  credentials or hosted data.
- Prepare a replacement-shadow packet for Client Health only after its owner
  chooses that path; until then preserve the stopped-job/unavailable posture.
- Compare source contracts and document evidence gaps for TOM writers and
  Client Health metrics.
- Review the `AdminStageDetail.tsx` call graph and pure display boundaries;
  do not move behavior-bearing code without a cleared oracle and owner.

## Explicitly not authorized by this packet

No capability or role change, grant, pilot enrollment, telemetry sink,
credential creation/use, hosted QA, migration, schema/RLS/RPC/trigger/
Realtime change, Edge deployment, cron/job change, forecast restart/repair/
deletion/backfill, metric score/threshold change, or production data action.

## Verification

Documentation-only packet. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
Runtime suites and live verification are not applicable because no runtime or
environment changed.
