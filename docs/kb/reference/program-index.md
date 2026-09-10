# Unicorn 2.0 — Program Index

> **Last updated:** 2026-09-10 · **Reconsider by:** 2026-10-08 · **Confidence:** high (status lines below are read from each initiative's own master doc header, not inferred).

Canonical glue across the four active initiatives. This file records
**status, current phase/packet, dependencies/gates, authoritative document
links, next decision or exit criterion, and links to the most relevant
audit entries** — nothing else. It never restates implementation detail,
test output, or historical narrative; that lives in each initiative's own
phase docs and in `docs/audit-log/entries/`.

This is a different document from [`README.md`](README.md) (the KB
Lifecycle Registry) — that file tracks the active/planning/completed/
superseded status of *every* doc in `docs/kb/`, not just these four
initiatives. Start here for "where does this program stand," go to
`README.md` for "is this specific doc still current."

## The four initiatives

| Initiative | Status | Current phase/packet | Master plan |
|---|---|---|---|
| Codebase Optimization | active | Phase 2.6 stabilization — Phase 3 lifecycle pilot underway; P7-B/P7-C complete and the P7-D auth/profile/membership contract-seam scope complete through PR #1079 | [`codebase-optimization-plan-2026-08-28.md`](codebase-optimization-plan-2026-08-28.md) |
| RBAC v6 | planning | Implementation plan only — §13 policy baseline agreed 2026-09-10 for read-only/shadow preparation; no production migration, Edge deployment, permission grant, or role change authorized yet | [`rbac-v6-authorization-implementation-plan-2026-09-01.md`](rbac-v6-authorization-implementation-plan-2026-09-01.md) |
| Tenant Operating Model | planning | All 13 §18 decisions closed 2026-09-10 (ADR-017 through ADR-028); Phase P0/P1 implementation scoping not yet started or authorized | [`tenant-operating-model-data-architecture-plan-2026-09-02.md`](tenant-operating-model-data-architecture-plan-2026-09-02.md) |
| Client Health Activity Analytics | planning (architecturally a child of Tenant Operating Model — see Dependencies below) | Current implementation reconciliation (2026-09-08): P3-A has contained the legacy stage-health signal on the main dashboard, executive widget, triage views, and Ask Viv hotspot tool | [`client-health-activity-analytics-plan-2026-09-03.md`](client-health-activity-analytics-plan-2026-09-03.md) |

## Active work

One row per initiative — a glance-able summary of who's on what right now,
refreshed at task boundaries (packet start/finish), not per-commit. This
is not a substitute for `git worktree list` / `gh pr list` for true
real-time state.

| Initiative | Current phase/packet | Branch | Owner/tool | Started |
|---|---|---|---|---|
| Codebase Optimization | Phase 3 lifecycle pilot — P7-D auth/profile/membership contract-seam scope closed through PR #1079; no active bounded packet allocation recorded | — | — | — |
| RBAC v6 | §13 policy baseline recorded; implementation packet not authorized | — | — | — |
| Tenant Operating Model | §18 items 2-13 closed (item 1 tracks with RBAC v6 §13 item 1); Phase P0/P1 scoping not yet started | — | — | — |
| Client Health Activity Analytics | P3-A consumer containment closed 2026-09-08 | — | — | — |

## Dependencies and gates

- **RBAC v6** is a prerequisite for wider Tenant Operating Model rollout:
  the tenant plan's own §18 item 1 (same decision as RBAC v6 §13 item 1)
  gates tenant P1/P2 implementation and any new directory/context/AI/BI
  permission surface behind RBAC v6's staff-scope and shadow-cutover
  decisions (see
  `tenant-operating-model-data-architecture-plan-2026-09-02.md`'s own
  "Stop gate" language — corrected from a prior mis-citation of item 3,
  which is the unrelated canonical-key decision, closed by ADR-018).
- **Client Health Activity Analytics** is architecturally a *child* of
  Tenant Operating Model, not a fully independent peer — its own header
  names Tenant Operating Model as "Parent architecture." It's tracked as
  its own initiative file here because it has its own phased execution
  (P3-A, etc.), not because it's decision-independent.
  Codebase Optimization's Phase 3 work overlaps directly with Client
  Health (see `codebase-optimization/phase-3/` — P3-A's own packet doc
  lives there, cross-linked to the Client Health plan).
- **Codebase Optimization**'s Phase 2.6 stabilization is the operational
  execution lane for bug fixes and consolidation surfaced across all
  three other initiatives' investigation work — it does not own their
  product decisions, only executes bounded, pre-approved fixes.

## Open decisions blocking further work

- RBAC v6 §13 — policy baseline agreed 2026-09-10 for read-only/shadow
  preparation (broad internal-staff context, seat/profile taxonomy, hard-SA
  boundary, grants, messaging, AI context, QA, and shadow thresholds); exact
  capability rows and implementation sequencing remain packet-level work, while
  items 14/15 remain explicitly parked — see the plan itself for the full
  disposition.
- Tenant Operating Model §18 — items 2-13 closed 2026-09-10 (ADR-017
  through ADR-028 in `decision-trail.md`); item 1 tracks with RBAC v6 §13
  item 1 above. Phase P0/P1 implementation is not yet scoped or
  authorized by these decisions alone. Item 14 (a §18 sub-item, not a
  14th top-level decision): how the 72 tenant-less `public.users` rows
  should actually be classified/assigned (parked 2026-09-08 during the
  notification-preferences fix — see
  `docs/audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md`).

## Recent relevant audit entries

Not exhaustive — `docs/audit-log/INDEX.md` is the full chronological
record. These are the entries most load-bearing for current status:

- [2026-09-08 — Allow tenant-less users to save notification preferences](../../audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md) — closed Codebase Optimization P4-D's last item; parked the tenant-assignment decision to Tenant Operating Model §18.
- [2026-09-08 — P3A main-dashboard health-read retirement](../../audit-log/entries/2026-09-08-p3a-main-dashboard-health-read-retirement.md) — closed Codebase Optimization P3-A / Client Health consumer containment.
- [2026-09-08 — M4 forecast/health cron retirement](../../audit-log/entries/2026-09-08-retire-m4-forecast-health-crons.md) — unscheduled the empty-output forecast jobs and retained their data/functions for the Client Health replacement.
