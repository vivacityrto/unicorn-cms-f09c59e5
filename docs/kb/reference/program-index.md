# Unicorn 2.0 — Program Index

> **Last updated:** 2026-09-11 · **Reconsider by:** 2026-10-08 · **Confidence:** high (status lines below are read from each initiative's own master doc header, not inferred).

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
| Codebase Optimization | active | Phase 4 slices 1-8 are the program's complete closed scope as of the [joint exit re-audit](codebase-optimization/phase-4/p6-exit-reaudit-joint-recommendation.md) (2026-09-11): of 9 genuinely-new large-file candidates fresh metrics surfaced, none is a clean Codebase-Optimization-only seam — each routes to TOM/RBAC/Client Health's own discovery gate or needs a joint ownership matrix (`AdminStageDetail.tsx`, no existing owner found). No Phase 4 slice 9 recommended. | [`codebase-optimization-plan-2026-08-28.md`](codebase-optimization-plan-2026-08-28.md) |
| RBAC v6 | planning | All 15 §13 items dispositioned (item 1 permanently decided 2026-09-11 via ADR-030; items 2-13 baselined 2026-09-10; items 14/15 parked). Packet P0.1 complete 2026-09-11 — both [P0.1-a (static)](rbac-v6/p0/p0-1-a-static-inventory.md) and [P0.1-b (live DB)](rbac-v6/p0/p0-1-b-live-inventory.md) delivered; confirmed the plan's 85 features/523 role rows figures exactly. Packet P1's mechanical export ([P1-a](rbac-v6/p1/p1-a-review-worksheet.md)) and a discussion-draft classification ([P1-b](rbac-v6/p1/p1-b-draft-classification.md), NOT approved — a straw-man for product review) both delivered 2026-09-11; the ADR, job-role defaults, and golden access matrix remain blocked on Carl/Vivacity product and security decisions. No production migration, Edge deployment, permission grant, or role change authorized yet. | [`rbac-v6-authorization-implementation-plan-2026-09-01.md`](rbac-v6-authorization-implementation-plan-2026-09-01.md) |
| Tenant Operating Model | planning | All 13 §18 decisions closed (items 2-13 on 2026-09-10 via ADR-017 through ADR-028; item 1 on 2026-09-11 via ADR-030). **Correction 2026-09-11:** this row previously said P0/P1 scoping "not yet started or authorized" — stale; the plan's own §7 packet table already shows P0.1 (tenant operating-model inventory) **in progress since 2026-09-05** (PR #647, [`tenant-p0-source-inventory.md`](../codebase-state/tenant-p0-source-inventory.md)), read-only/behavior-preserving discovery explicitly pre-authorized by the plan itself (§1: "tenant P0 evidence collection does not need to wait for RBAC because it is read-only and behavior-preserving"). Carl authorized Codex to continue/expand P0.1 2026-09-11, folding in the `ManageTenants.tsx` field/source-of-truth matrix, identity ledger, and view/RPC/write graph the Phase 4 exit re-audit surfaced. P0.2/P0.3 and all of P1+ remain not started/not authorized. | [`tenant-operating-model-data-architecture-plan-2026-09-02.md`](tenant-operating-model-data-architecture-plan-2026-09-02.md) |
| Client Health Activity Analytics | planning (architecturally a child of Tenant Operating Model — see Dependencies below) | Current implementation reconciliation (2026-09-08): P3-A has contained the legacy stage-health signal on the main dashboard, executive widget, triage views, and Ask Viv hotspot tool. **H0.1** (current-state contract, reproducible read-only audit) authorized by Carl to start 2026-09-11 — the plan's own §1 pre-authorizes this as read-only/behavior-preserving, running in parallel with TOM P0.1. Candidate sources from the Phase 4 exit re-audit: `ClientStructuredNotesTab.tsx`, `TasksManagement.tsx`. | [`client-health-activity-analytics-plan-2026-09-03.md`](client-health-activity-analytics-plan-2026-09-03.md) |

## Active work

One row per initiative — a glance-able summary of who's on what right now,
refreshed at task boundaries (packet start/finish), not per-commit. This
is not a substitute for `git worktree list` / `gh pr list` for true
real-time state.

| Initiative | Current phase/packet | Branch | Owner/tool | Started |
|---|---|---|---|---|
| Codebase Optimization | Phase 4 (slices 1-8) closed 2026-09-11 per the joint exit re-audit; no slice 9 | — | Claude Code / Codex | 2026-09-11 |
| RBAC v6 | §13 fully dispositioned; Packet P0.1 (a+b) delivered 2026-09-11; P1-a (worksheet) + P1-b (draft classification, unapproved) delivered, rest of P1 blocked on Carl/product decisions | hotfix/rbac-p1-scoping | Claude Code | 2026-09-11 |
| Tenant Operating Model | §18 items 1-13 all closed; P0.1 in progress since 2026-09-05 (PR #647), continuing 2026-09-11 with `ManageTenants.tsx` field/source-of-truth matrix | — | Codex | 2026-09-05 (P0.1 start) / 2026-09-11 (continuation) |
| Client Health Activity Analytics | P3-A consumer containment closed 2026-09-08; H0.1 current-state audit starting 2026-09-11 | — | Claude Code | 2026-09-11 |

## Dependencies and gates

- **RBAC v6's staff-scope decision (§13 item 1 = TOM §18 item 1) closed
  2026-09-11 via ADR-030** — broad internal-staff tenant read access is
  now the permanent policy, not an open design question. This was the one
  decision gating TOM P1/P2 implementation and RBAC v6's own P1
  (capability-row catalogue) behind an unresolved staff-scope question
  (see `tenant-operating-model-data-architecture-plan-2026-09-02.md`'s
  own "Stop gate" language). Both plans can now proceed to actual P1
  scoping work without this specific blocker — remaining gates are the
  concrete capability-catalogue/implementation-sequencing work itself
  (packet-level, not a Carl/Vivacity decision) and each plan's own
  not-yet-authorized production/migration steps.
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

- **RBAC v6 §13 item 1 = TOM §18 item 1 — closed 2026-09-11 (ADR-030):**
  broad internal-staff tenant read access is now the permanent policy;
  no future portfolio/assignment-scope narrowing. This was the last
  Carl/Vivacity decision blocking either plan's P1 work.
- RBAC v6 §13 — all 15 items now have a recorded disposition: item 1 per
  ADR-030 above; items 2-13 baselined 2026-09-10 (broad internal-staff
  context, seat/profile taxonomy, hard-SA boundary, grants, messaging, AI
  context, QA, and shadow thresholds); items 14/15 remain explicitly
  parked. What's left is not a Carl/Vivacity decision but packet-level
  work: the exact capability-row catalogue and implementation sequencing
  (RBAC v6 plan §7 P1) — see the plan itself for the full disposition.
- Tenant Operating Model §18 — all 13 numbered decisions now closed:
  items 2-13 on 2026-09-10 (ADR-017 through ADR-028 in
  `decision-trail.md`), item 1 on 2026-09-11 (ADR-030). Phase P0/P1
  implementation is not yet scoped or authorized by these decisions
  alone — that scoping is the next packet-level work, not a further
  Carl/Vivacity decision. Item 14 (a §18 sub-item, not a 14th top-level
  decision, still open): how the 72 tenant-less `public.users` rows
  should actually be classified/assigned (parked 2026-09-08 during the
  notification-preferences fix — see
  `docs/audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md`).

## Recent relevant audit entries

Not exhaustive — `docs/audit-log/INDEX.md` is the full chronological
record. These are the entries most load-bearing for current status:

- [2026-09-08 — Allow tenant-less users to save notification preferences](../../audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md) — closed Codebase Optimization P4-D's last item; parked the tenant-assignment decision to Tenant Operating Model §18.
- [2026-09-08 — P3A main-dashboard health-read retirement](../../audit-log/entries/2026-09-08-p3a-main-dashboard-health-read-retirement.md) — closed Codebase Optimization P3-A / Client Health consumer containment.
- [2026-09-08 — M4 forecast/health cron retirement](../../audit-log/entries/2026-09-08-retire-m4-forecast-health-crons.md) — unscheduled the empty-output forecast jobs and retained their data/functions for the Client Health replacement.
