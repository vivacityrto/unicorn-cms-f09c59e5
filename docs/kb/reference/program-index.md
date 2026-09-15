# Unicorn 2.0 — Program Index

> **Last updated:** 2026-09-15 · **Reconsider by:** 2026-10-10 · **Confidence:** high (status lines below are read from each initiative's own master doc header and the latest merged phase/packet evidence, not inferred).

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

Current cross-initiative approval coordination is consolidated in the
[unattended preparation authorization matrix](codebase-optimization/cross-cutting/unattended-preparation-authorization-matrix-2026-09-13.md).
The latest [preparation-to-implementation transition review](codebase-optimization/cross-cutting/preparation-to-implementation-transition-review-2026-09-14.md)
records the merged-PR archaeology, identifies evidence that was already
implemented before later documentation, and freezes generic preparation unless
a new PR closes a named gate.

## The four initiatives

| Initiative | Status | Current phase/packet | Master plan |
|---|---|---|---|
| Codebase Optimization | active | Phase 4 slices 1-8 are the program's complete closed scope as of the [joint exit re-audit](codebase-optimization/phase-4/p6-exit-reaudit-joint-recommendation.md) (2026-09-11). No Phase 4 slice 9 is recommended; remaining large-file candidates route to TOM/RBAC/Client Health discovery or a joint ownership matrix. Phase 5 is not started; separate Phase 2.6 stabilization work remains possible when independently scoped. | [`codebase-optimization-plan-2026-08-28.md`](codebase-optimization-plan-2026-08-28.md) |
| RBAC v6 | planning | All 15 §13 items dispositioned (item 1 permanently decided 2026-09-11 via ADR-030; items 2-13 baselined 2026-09-10; items 14/15 parked). Packet P0.1 and the broad P1 preparation set through P1-u are delivered, including the 85 features/523 role rows inventory, atomic decomposition, boundary worksheets, and validators. The named [P1-v synthetic read-boundary fixture contract](rbac-v6/p1/p1-v-aj-csc-read-boundary-fixture-contract.md) is now prepared for the package-instance and client-stage evidence slice. The [P1-x `eos.rocks.own.manage` golden-matrix](rbac-v6/p1/p1-x-eos-rocks-own-manage-golden-matrix-draft.md) is **confirmed golden 2026-09-15 (Carl)** as R2-a's second vertical slice — its tracing surfaced a real live authorization bypass in `upsert_rock_with_parenting` (fixed same-day, PR #1354), an `eos.rocks.company.create` role restriction that was never actually enforced (catalogue updated to match reality: internal staff can create rocks), and dead archive/delete code now wired up for real. The [P1-y `eos.configurations.manage` golden-matrix](rbac-v6/p1/p1-y-eos-configurations-manage-golden-matrix-draft.md) is **confirmed golden 2026-09-15 (Carl)** as R2-a's third vertical slice — fresh live re-verification (RLS, `role_permissions`, and a sweep of 5 `SECURITY DEFINER` functions for the same write-bypass defect class found in P1-x) found this row genuinely clean already; no fix was needed. Two §13 item-2 sub-decisions moved from baselined to **executed** on 2026-09-15 (PR #1347): CET is retired in `dd_unicorn_roles` and removed from active-role arrays (zero holders, zero test dependencies); Team Leader is retired in the catalogue but deliberately kept in the frontend role arrays (a real `useRBAC` access-control test regression showed it's still load-bearing), matching Team Member's existing backward-compat treatment. The multi-role concept (one person holding more than one profile, e.g. Nova as Integrator + CSC) is confirmed already live via the existing `user_roles`/`check_permission()` infrastructure, not a new build. These remain preparation: capability rows, role defaults, pilot, shadow telemetry, grants, hosted runs, and enforcement are not approved. The [remaining gated approval packet](codebase-optimization/cross-cutting/remaining-gated-approval-packets-2026-09-12.md) names the actual product/security inputs. Generic row or packet refreshes are paused pending a named implementation/evidence slice. | [`rbac-v6-authorization-implementation-plan-2026-09-01.md`](rbac-v6-authorization-implementation-plan-2026-09-01.md) |
| Tenant Operating Model | planning | All 13 §18 decisions are closed. P0.1/P0.2/P0.3 evidence and owner dispositions are complete. P1.1 contact-promotion canary evidence passed. P1.2-b's guarded ghost-contact snapshot and P1.2-d's approved one-row plus 5/5/4 `unicorn-qa` apply batches passed with redacted evidence, per-batch postflight, zero out-of-scope writes, and a terminal classifier showing zero eligible candidates. P1.2-c's bounded caller closure is merged in PR #1356 and the aggregate-only live census is reconciled: the two cancelled activation items are stale June 3 snapshots for active primary contacts, while the 41 current ghost-flagged auth users require account-level invitation classification. Carl approved non-destructive holds for the stale items and 31 never-signed-in ghost accounts. Durable audit correlation now records 8 pre-retained and 56 retained historical activation target users, including 31 current never-signed-in ghost accounts in the retained set, with zero post-guard activation audit rows. The RBAC/security review is complete for the replacement boundary; the request-log retention gap, broader profile classification, and Edge retirement remain separately gated. The [P1.2-c retirement decision packet](tenant-operating-model/p1/p1-2-c-ghost-activation-retirement-decision-packet.md) records the recommended hold and the requirements for any future operational retirement packet. | [`tenant-operating-model-data-architecture-plan-2026-09-02.md`](tenant-operating-model-data-architecture-plan-2026-09-02.md) |
| Client Health Activity Analytics | planning (architecturally a child of Tenant Operating Model — see Dependencies below) | H0 characterization/containment and H0.3b/c forecast disposition are delivered, and the [consultant report template/evidence schema](client-health-activity-analytics/h0/h0-4-consultant-report-template-and-evidence-schema.md) is prepared. Replacement-shadow, freshness/quality, metric policy, and consultant-data gates remain open; H1 scoring work has not started. | [`client-health-activity-analytics-plan-2026-09-03.md`](client-health-activity-analytics-plan-2026-09-03.md) |

## Time-boxed delivery workstreams

These are bounded product deliveries that coordinate with the four
initiatives above without becoming new cross-cutting programs.

| Workstream | Status | Current packet | Dependencies/gates |
|---|---|---|---|
| Academy Solo MVP | implementation in progress (controlled pilot target 2026-09-15); invitation compatibility, capacity-RPC, reversible-Solo, drawer-close, and RTO-default fixes prepared; authenticated pilot verification pending | [`academy-solo-mvp-implementation-packet.md`](academy-solo/phase-1/academy-solo-mvp-implementation-packet.md) | Existing identity/tenant primitives; server-side Academy boundary; valid legacy `User` role plus `academy_user`/`academy_only` authority; distinct Academy Customers lifecycle; explicit Academy-vs-RTO directory classification with RTO default; no RTO/package/Client Health semantics; named-user approval; QA negative cases; separate hosted migration review. |

## Active work

One row per initiative — a glance-able summary of who's on what right now,
refreshed at task boundaries (packet start/finish), not per-commit. This
is not a substitute for `git worktree list` / `gh pr list` for true
real-time state.

| Initiative | Current phase/packet | Branch | Owner/tool | Started |
|---|---|---|---|---|
| Codebase Optimization | Phase 4 closed 2026-09-11; no current implementation packet; Phase 5 deferred | — | Claude Code / Codex | 2026-09-14 |
| RBAC v6 | P0.1/P1 review-ask questions resolved 2026-09-15 (vocabulary, hard-SA lock list, owners, tenant/relationship semantics for all 18 P1-e rows); first vertical slice `eos.scorecard.manage` approved and golden-matrix draft ([P1-w](rbac-v6/p1/p1-w-eos-scorecard-golden-matrix-draft.md)) **confirmed golden 2026-09-15 (Carl)**. A real client-tenant RLS gap this work surfaced was fixed same-day (PRs #1323, #1325). Same day: System Account role added for 3 non-human identities + staff-picker `is_system_account` hygiene sweep (PR #1339); `is_qa_persona` replaces the legacy `kpi_pod='qa'` marker across 17 frontend call sites and 4 DB functions, CET retired, Nova's real account given a supplemental CSC role via the existing multi-role infrastructure, and a missed `authenticated` SELECT grant caught and fixed in the same PR (#1347, merged, live-verified via Playwright across 10+ staff-picker surfaces). Follow-up (PR #1351, merged): 13 hand-rolled staff-picker queries consolidated onto the existing `useVivacityTeamUsers()` hook, closing two live bugs found in the process (disabled/archived legacy accounts were selectable in `ClientActionItemsTab`'s and `NewAuditModal`'s staff pickers). `kpi_pod` column drop remains queued, gated on production soak time since PR #1347. Investigated `eos.rocks.own.manage` as a second vertical slice (draft [P1-x](rbac-v6/p1/p1-x-eos-rocks-own-manage-golden-matrix-draft.md), now confirmed golden) — found a real live authorization bypass in `upsert_rock_with_parenting` (`SECURITY DEFINER`, zero internal check, RLS-bypassing table-owner write path, `EXECUTE` granted to any authenticated user), fixed same-day (PR #1354). Carl's dispositions on the two remaining open findings: internal staff can create rocks (`eos.rocks.company.create`'s catalogue restriction retired to match already-live behavior), `eos.rocks.own.manage` stays broad, and archive/delete are wired up for real (previously dead code, now with a children-guard on hard delete matching `eos.scorecard.manage`'s precedent, PR #1358). `eos.configurations.manage` ([P1-y](rbac-v6/p1/p1-y-eos-configurations-manage-golden-matrix-draft.md)) **confirmed golden 2026-09-15 (Carl)** as a third vertical slice — fresh live re-verification found RLS/`role_permissions` already correctly scoped and no `SECURITY DEFINER` write-bypass (the 5 functions referencing these tables are all read-only against them); no code change was needed | — | Claude Code | 2026-09-15 |
| Tenant Operating Model | P1.2-c static closure merged; read-only job/account census and RBAC/security review complete; historical-log completeness, broad legacy-profile scope, and retirement authority remain gated | `codex/tom-p1-2c-retirement-decision-20260915` | Codex | 2026-09-15 |
| Client Health Activity Analytics | H0 containment and evidence preparation delivered; consultant operational data blocks metric policy; replacement shadow remains separately gated | — | Claude Code / Codex | 2026-09-14 |
| Academy Solo MVP delivery workstream | Phase 1 invitation compatibility, server boundary, manual lifecycle, and directory/account-surface separation | `codex/manage-clients-academy-surface-20260915` | Codex | 2026-09-15 |

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
- **Academy Solo** is intentionally a time-boxed delivery workstream, not a
  fifth program initiative. Its packet is the authority for the controlled
  pilot; the four initiative plans remain authoritative for RBAC, tenant
  semantics, codebase process, and Client Health impact. Its temporary
  tenant-backed row may remain visible in the shared directory, but the
  account-type classification and RTO-only metric/action exclusions are part
  of the packet contract. The invitation compatibility fix uses the existing
  `User` role vocabulary and keeps `academy_user`/`academy_only` as the access
  boundary; no initiative should infer a new global role, package, analytics
  metric, or RTO workflow from this workstream.
- **Codebase Optimization**'s Phase 2.6 stabilization is the operational
  execution lane for bug fixes and consolidation surfaced across all
  three other initiatives' investigation work — it does not own their
  product decisions, only executes bounded, pre-approved fixes.

## Open decisions blocking further work

The items below mix true human/product decisions with packet-level evidence
and owner-review gates. A gate is not automatically a request for another
product decision; each row names the condition that must be satisfied before
runtime or production work begins.

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
- **TOM P0.2/P0.3 preparation approved 2026-09-12:** the synthetic,
  production-shaped fixture was seeded and verified in allowlisted `unicorn-qa`
  on 2026-09-13. Expanded protected characterization covers nine browser
  personas plus a non-browser service-principal read contract; the corrected
  representative query-family run `34757778368` passed 84 checks and
  intentionally skipped 48 client-inapplicable checks. Route timings, request
  waterfalls, the versioned production cutoff, aggregate production/QA
  cardinality comparison, and the linked audit entry are recorded. Address UI
  and separate Ask Viv conversation-history browser coverage plus
  cross-initiative owner review remain open. **Client Health H1 semantics approved 2026-09-12:** missing or stale
  burn/retention inputs are to remain `unavailable`/unknown; the five named
  consumer-containment slices are delivered. H0.3b/c evidence and owner
  disposition now record retaining the current composite jobs without
  restart/repair; replacement-shadow, freshness/quality, and consultant-data
  gates remain open.
- **Academy Solo Phase 1 is implementation-gated, not commercially launched:**
  the controlled pilot, published-course catalogue, all-internal-staff scope,
  Vivacity Academy course/replay interpretation, and identity creation path
  are approved. The first tenant/user fixture and authenticated negative-case
  verification remain required. Public checkout, billing, Team/Elite, and
  legacy-user conversion remain out of scope.
- **Academy Solo invitation correction (2026-09-15):** the first QA browser
  run found the acceptance RPC writing a non-existent `Academy User` lookup
  value. The QA-applied fix writes legacy `User`, returns relationship context,
  safely binds anonymous acceptance to the invited auth identity, and preserves
  the Academy-only relationship/access fields. Authenticated browser
  re-verification passed and created no package instance. Supabase Auth email
  rate limiting and the empty QA published-course catalogue remain recorded as
  environment/data readiness limitations, not application evidence.

## Recent relevant audit entries

Not exhaustive — `docs/audit-log/INDEX.md` is the full chronological
record. These are the entries most load-bearing for current status:

- [2026-09-15 — TOM P1.1 hosted QA contact-promotion canary](../../audit-log/entries/2026-09-15-tom-p11-contact-promotion-qa-canary.md) — bounded allowlisted QA contact → invitation → browser acceptance passed with QA no-send, idempotent retry, complete cleanup, and audit-preserving actor retention; no production change.
- [2026-09-15 — TOM P1.2-b guarded ghost-contact dry-run](../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-dry-run.md) — protected allowlisted QA snapshot passed after a narrow QA-only view-read grant correction; 15 membership-bearing ghosts classified, zero membershipless/collision holdouts, redacted evidence retained privately, and zero writes.
- [2026-09-15 — TOM P1.2-d one-row ghost-contact QA apply canary](../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-apply-canary.md) — protected one-row `unicorn-qa` contact projection passed with one created contact/audit row, zero out-of-scope writes, and a repeat read-only reconciliation showing 14 untouched candidates; remaining rows, retirement, invitations, and production remain separately gated.
- [2026-09-15 — TOM P1.2-d bounded ghost-contact QA batches](../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-bounded-batch.md) — approved one-row plus 5/5/4 QA projection completed with per-batch postflight and terminal read-only reconciliation showing 15 existing-contact matches, zero eligible candidates, and zero projected future inserts; retirement and production/runtime work remain separately gated.
- [2026-09-15 — TOM P1.2-c hold and historical invocation review](../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-hold-and-history.md) — approved non-destructive holds preserve stale job/account state; retained logs show 109 legacy-path requests, with a June 3–16 provider-retention gap, so Edge retirement remains held.
- [2026-09-15 — TOM P1.2-c durable audit correlation](../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-audit-correlation.md) — aggregate-only durable audit evidence reconciles 8 pre-retained and 56 retained historical activation target users, with zero post-guard activation audit rows; no live state changed.
- [2026-09-08 — Allow tenant-less users to save notification preferences](../../audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md) — closed Codebase Optimization P4-D's last item; parked the tenant-assignment decision to Tenant Operating Model §18.
- [2026-09-08 — P3A main-dashboard health-read retirement](../../audit-log/entries/2026-09-08-p3a-main-dashboard-health-read-retirement.md) — closed Codebase Optimization P3-A / Client Health consumer containment.
- [2026-09-08 — M4 forecast/health cron retirement](../../audit-log/entries/2026-09-08-retire-m4-forecast-health-crons.md) — unscheduled the empty-output forecast jobs and retained their data/functions for the Client Health replacement.
- [2026-09-15 — Academy Solo invitation compatibility and account-surface decision](../../audit-log/entries/2026-09-15-academy-solo-invitation-compatibility.md) — corrected role vocabulary, Academy invitation copy, no-Sidekick boundary, distinct Manage Clients visibility contract, and allowlisted QA browser evidence.
- [2026-09-15 — System Account role + staff-picker hygiene sweep](../../audit-log/entries/2026-09-15-system-account-role-and-picker-hygiene.md) — new `System Account` `unicorn_role` for 3 non-human identities; added the missing `is_system_account` filter to 8 frontend staff-picker queries.
- [2026-09-15 — QA-persona flag, CET retirement, Nova multi-role fix](../../audit-log/entries/2026-09-15-qa-persona-flag-and-role-retirements.md) — replaces `kpi_pod='qa'` with `is_qa_persona`; retires CET (removed from active-role arrays) while keeping Team Leader in the frontend arrays after a real `useRBAC` access-control test regression; adds Nova's supplemental CSC role via the existing multi-role infrastructure; fixes a missing `authenticated` SELECT grant caught during this PR's own verification.
- [2026-09-15 — Unauthenticated-scope write bypass in `upsert_rock_with_parenting`](../../audit-log/entries/2026-09-15-gate-upsert-rock-with-parenting-security-definer.md) — found while investigating `eos.rocks.own.manage` as a candidate second RBAC v6 vertical slice: a `SECURITY DEFINER` RPC (the real write path behind every EOS rock "Edit" action) bypassed RLS entirely and had zero internal authorization check, letting any authenticated user create or edit any EOS rock; fixed same-day with an `is_vivacity_team_safe()` gate.
- [2026-09-15 — `eos.rocks.company.create` catalogue fix + wired-up archive/delete](../../audit-log/entries/2026-09-15-eos-rocks-company-create-and-archive-delete.md) — Carl's dispositions on P1-x's open findings: internal staff can create rocks (catalogue updated to match already-live behavior), `eos.rocks.own.manage` stays broad, and real archive/delete UI wired up (previously dead code) with a children-guard on hard delete matching `eos.scorecard.manage`'s precedent.
