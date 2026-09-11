# TOM × RBAC v6 capability intersection — first-pass cross-check

> **Parent plans:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) · [Tenant Operating Model, Directory Performance, ERP, and Ask Viv Data Architecture Plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** planning — joint scoping artifact, no implementation started
> **Owner:** Claude Code + Codex (joint)
> **Scope:** the explicit intersection table Codex proposed in its TOM P0/P1 draft (2026-09-11), for the six highest-value surfaces, revised per Codex's follow-up to keep three columns distinct rather than conflated: current behavior, TOM's target semantics, and RBAC's target authorization
> **Dependencies:** [RBAC v6 P0.1 packet scoping](p0-1-inventory-packet-scoping.md); RBAC v6 §13 item 1 = TOM §18 item 1 (staff tenant-visibility scope, not yet resolved)
> **Exit criteria:** every cell below is either **Proven** (cited source/live evidence) or explicitly **Open**/**Needs P0.1-b** — never silently assumed
> **Evidence:** RBAC-side citations from `p7-rbac-tenant-decision-evidence.md` §5-§6; TOM-side citations from Codex's two 2026-09-11 board messages (`20260911T100822-codex.md`, `20260911T100951-codex.md`) and ADR-017 through ADR-028
> **Audit entry:** none — planning artifact only, no schema/RLS/grant/migration/production-data change

## How to read this table

Three columns are kept deliberately separate per Codex's correction to the
first draft of this table, because collapsing them hides exactly the kind
of premature-claim risk this cross-check exists to catch:

1. **Current behavior** — what the system actually does today, per RBAC
   P0.1's inventory scope (source-cited or live-verified, never assumed).
2. **TOM target semantics** — the *approved* future vocabulary/data-authority
   decision (an ADR), which is a ratified target state, not yet an
   authorization boundary.
3. **RBAC v6 target authorization** — the capability/scope/relationship row
   this surface would eventually need, which stays **Open** until RBAC §13
   item 1 (staff tenant-visibility) and the specific capability rows are
   approved.

A TOM target semantics decision changing (e.g. `tenant_members` becoming the
future access authority) does **not** by itself change current behavior or
authorize a new RBAC scope — that distinction is the whole point of keeping
these columns apart.

| Surface | Current behavior (RBAC P0.1) | TOM target semantics (ADR) | RBAC v6 target authorization | Persona evidence | Rollback / stop signal |
|---|---|---|---|---|---|
| **Directory read** (Manage Tenants list) | **Proven:** all 7 `VIVACITY_STAFF_ROLES` get blanket `has_tenant_access_safe` pass, no per-tenant scoping; client users have no route here at all. Assembly is ad hoc per-hook fetches (`useTenantsBasic.ts` etc.), no versioned read-contract yet. | ADR-017 three-axis state (`status`/`lifecycle_status`/`access_status`) is the target semantic model for what's *displayed*; ADR-023 targets a live paginated directory at p95 ≤300ms. Neither ADR changes who can read it. | **Open.** Eventual key (`tenants.directory.view`?) and whether it stays staff-wide or gains a scope kind — blocked on §13 item 1. | CSC live-verified 2026-09-09 (QA account): `/manage-tenants` rendered normally. No negative/non-staff case live-tested (source-proven only: no route exists). | No packet exists yet — nothing to roll back. ADR-028 tier not yet assigned. |
| **Tenant-detail read** | Same broad-staff-read baseline as directory; detail page aggregates package/contact/note/Xero fields per-tenant. | ADR-022 separates bounded-freshness KPI aggregates from live directory/detail fields — detail view likely spans both categories, not one capability. | **Open.** Whether detail needs its own capability (exposes Xero/notes, more sensitive than the list) or inherits directory's. | **Needs P0.1-b** — not live-tested for this specific surface. | No packet exists yet. |
| **Status/lifecycle transition** (suspend/close/archive/reactivate) | **Proven:** `tenant-lifecycle` Edge Function gates archive/reactivate-from-archived on SuperAdmin explicitly; suspend/close were tightened onto the same tier after a documented review gap (AGENTS.md Edge Function guardrails section). | ADR-017's three-axis state is the mutation's target; current live system still has two writers plus a trigger with known gaps (per Codex) — P0.1 must inventory that as-is, not as an already-enforced boundary. | Has an actual **capability-tiering precedent** already (broad gate for read-adjacent actions, SuperAdmin-tier for destructive ones) — the only row where target authorization partly already exists in practice. | `qa:data-lifecycle` suite live-proven 11/11 (workflow run `34289646607`) — the only surface here with a full automated positive+negative persona suite already. | Already shipped/tested — no rollback pending. Any *future* v6 recapture uses ADR-028 Critical tier (destructive-action risk: 14 days, staff + 1-2 known-safe tenants, zero unexplained regressions). |
| **Service-assignment read/write** (`package_instances`/`stage_instances`) | **Open, least-evidenced row.** Reached through the same blanket staff-tenant-access predicate as everything else; no distinct read-vs-write or own-vs-assigned rule recorded. | ADR-021 ratifies `package_instances`/`stage_instances` as canonical authority, but 3 legacy callers (`AddStageDialog`, `GeneratedDocumentsTab`, `AskVivScopeSelectorModal`) still read/write legacy columns — affects *resource-resolution*, not current RBAC allows. | **Open.** No capability key recorded; TOM's own open question 3 asks the same thing from the resource-resolution side. | None tested. **Needs P0.1-b** for both the 3 legacy callers' actual auth checks and live verification. | No packet exists. Flagged by both drafts as needing the most net-new evidence before either side proposes a row. |
| **Messages/realtime** | **Proven, live-verified:** `is_conversation_participant_safe` + `has_tenant_access_safe` RLS confirmed via direct `pg_policies` read — SELECT requires actual participant membership, not just tenant match. Most rigorously proven row in this table. | `ClientTenantContext` reads `tenant_users` (parallel path to staff's `tenant_members`); ADR-019 ratifies `tenant_members` as future access authority but does not yet retire `tenant_users` — both stay in P0.1's current-graph inventory per Codex. | Already-shipped RLS; any future v6 wrapper stays additive per §5.10 (never combine old/new evaluators with OR). | 15 live tenant-isolation RLS tests passing (workflow run `34179875080`) — cross-tenant denial, same-tenant-different-conversation denial, staff bypass, real personas. | N/A — already shipped and tested, not a pending cutover. |
| **Ask Viv context** | Not live-tested. **Needs P0.1-b** and a TOM-side characterization pass. | ADR-024 describes the target split (broad operational staff context vs. client own-tenant/RTO-scoped), but live corpus still lacks ACL/tombstone/retention-class schema — relies on application scoping today, per Codex. | **Proven baseline (2026-09-09):** staff gated by `staff.ai` + explicit tenant-fact scope; client gated by active membership. Retention/deletion SLA unratified (RBAC §13 item 13 = TOM §18 item 9, same open question). | None live-tested for this surface specifically. | No packet exists. Codex's open question 6 (7-year retention anchor, ACL/tombstone mapping) blocks implementation regardless of capability naming. |

## What this table actually shows

**Status/lifecycle transition** and **messages/realtime** already have real
proven evidence in all three columns — safest to formalize into a versioned
capability row first, precisely because they're already live-tested, not
because they're simplest. **Service-assignment read/write** is the least
evidenced row and should not be assumed low-risk just because it hasn't
been investigated — it's a live read/write surface with three
uncharacterized legacy callers. **Directory read**, **tenant-detail read**,
and **Ask Viv context** each have a proven baseline in one or two columns
but a real gap in at least one — none should be treated as fully
characterized yet.

None of this table authorizes a capability name, a scope kind, an
enforcement change, or a TOM data-authority cutover. It is the joint
evidence base both packets cite before either is proposed to Carl.

## Reconciliation outcome (both agents agree)

- Claude's RBAC P0.1 packet (static + live-read inventory) can be authorized
  **independently** of the staff-visibility decision (§13 item 1) — it
  records current behavior regardless of what the future policy becomes.
- Codex's TOM P0 (read-only discovery: identity/writer graph, golden
  behavioral contract, QA evidence path) can also proceed independently.
  TOM P1 (versioned directory-contract design) **cannot** be treated as
  implementation-ready until it consumes RBAC P0.1's output and the §13
  item-1 decision is made — TOM should not run its own separate inventory
  pass duplicating P0.1's scope.
- Neither packet claims a target semantic decision (an ADR) already changes
  current authorization — that conflation was the specific risk this
  revision corrects.

## Still open, carried into the joined recommendation

Codex's TOM draft open questions 1-8 all still apply. Adding, from this
cross-check: whether RBAC P0.1 gets authorized as its own packet before or
alongside TOM P0, since TOM P1's directory-contract work depends on P0.1
evidence this table shows is still missing for 4 of 6 surfaces.
