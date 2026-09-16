# Tenant Operating Model — Codex pause/resume handoff

> **Last updated:** 2026-09-16  
> **Status:** paused for Carl's temporary ComplyHub focus; no TOM implementation is currently in flight  
> **Owner:** Codex for TOM; Claude owns RBAC v6; Academy Solo is a separate delivery workstream  
> **Authority:** [TOM master plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md) and [Program Index](../../program-index.md)

This is the restart point for the next session that returns to Unicorn. It
records current truth and the next bounded TOM action without reopening the
completed P1.2-c retirement or repeating its hosted checks.

## Resume in this order

1. Read the [Program Index](../../program-index.md), this handoff, and the
   [TOM master plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md).
2. For the next queued item, read the [P0.2/P0.3 cross-initiative review
   matrix](../p0/p0-2-p0-3-cross-initiative-review-2026-09-13.md), the
   [cardinality/query-family follow-up](../p0/p0-2-p0-3-cardinality-query-family-follow-up-2026-09-13.md),
   and the linked fixture/baseline evidence before proposing work.
3. Treat current source, merged PRs, and linked audit entries as truth. Do
   not infer a new hosted write, migration, invitation, schema/RLS change,
   or credential action from this handoff.
4. Open a fresh dedicated branch from current `origin/main` for any new
   implementation or documentation change. Update the relevant KB and audit
   record when evidence or status changes.

## Completed baseline

The following is complete and should not be repeated:

- All 13 TOM §18 decisions are closed; the separate §18 item 14 question
  about 72 tenant-less `public.users` rows remains parked.
- P0.1 source inventory and owner dispositions are complete.
- P0.2/P0.3 bounded QA characterization, production metadata cutoff, and
  query-family evidence are recorded; owner review and remaining coverage
  gaps are still distinct from implementation approval.
- P1.1 contact-promotion QA canary passed with QA no-send, idempotent retry,
  cleanup, and audit-preserving actor retention.
- P1.2-b guarded ghost-contact snapshot and P1.2-d approved one-row plus
  5/5/4 `unicorn-qa` apply batches passed with redacted evidence, per-batch
  postflight, zero out-of-scope writes, and a terminal classifier showing
  zero eligible candidates.
- P1.2-c `activate-ghost-user` retirement is complete. Repository source and
  configuration retirement landed in [PR #1381](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1381);
  the final documentation closeout landed in [PR #1384](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1384),
  merged as `540d4a99c`. Hosted verification recorded 192 functions, the
  exact target absent, active fail-closed replacement guards, zero open or
  locked activation work, and zero immediate target request/audit counts.
  Carl explicitly waived the 60-minute observation after the prior
  in-window redeployment invalidated the earlier observation.

Canonical retirement records:

- [P1.2-c retirement evidence](p1-2-c-activate-ghost-retirement-evidence.md)
- [P1.2-c operational packet](p1-2-c-activate-ghost-retirement-operational-packet.md)
- [P1.2-c decision packet](p1-2-c-ghost-activation-retirement-decision-packet.md)
- [2026-09-16 retirement closeout audit entry](../../../../audit-log/entries/2026-09-16-tom-p12c-retirement-closeout.md)

## Next bounded TOM queue

The next safe TOM action is a documentation/evidence owner-review pass for
the executed P0.2/P0.3 work:

- reconcile the fixture, query-family, production-cutoff, and aggregate
  cardinality evidence against the cross-initiative review matrix;
- confirm the current `supabase_realtime` publication-gap disposition with
  the named owners; and
- keep Address UI, Ask Viv conversation-history coverage, export invocation,
  contact insertion, unmatched-row conversion, membership migration,
  Realtime repair, and broader runtime changes separately gated.

This is a read-only/documentation task unless a named owner or Carl makes a
new decision. It does not authorize fixture mutation, Realtime repair,
export execution, schema/RLS work, invitations, account changes, or
production activity.

## Held facts and non-goals

- The two stale cancelled activation items and 31 never-signed-in ghost
  accounts remain held under the prior non-destructive disposition.
- The aggregate unmatched-profile classification remains 356
  membership-bearing and 55 membershipless rows; it is not row-level
  conversion authority.
- The 60-minute observation waiver applies to the completed P1.2-c
  retirement closeout only. It is not a standing waiver for future hosted
  actions.
- Do not touch RBAC v6 capability-row catalogue or implementation sequencing
  in the TOM lane. Claude owns that work.
- Do not repeat the completed P1.2-c QA, deletion, redeployment diagnosis,
  or immediate verification unless new evidence creates a genuinely new
  decision.

## Stop conditions on return

Stop and bring the question to Carl if the next step would require a new
product/policy choice, security disposition, credential scope, destructive
or hosted action, migration/schema/RLS change, invitation/account mutation,
or a change to ownership between TOM and RBAC. Routine evidence
reconciliation and documentation checks may continue under the existing
scope.
