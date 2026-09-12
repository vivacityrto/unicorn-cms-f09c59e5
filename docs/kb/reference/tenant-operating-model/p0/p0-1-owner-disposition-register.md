# TOM P0.1 — owner-disposition register

> **Last updated:** 2026-09-12 · **Status:** ready for TOM/RBAC/Client Health owner review; no disposition is assumed
> **Parent plan:** [Tenant Operating Model Data Architecture Plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Program index:** [Program Index](../../program-index.md)
> **Evidence source:** [Tenant P0.1 Source Inventory](../../../codebase-state/tenant-p0-source-inventory.md)
> **Owner:** TOM, with RBAC and Client Health review where noted
> **Scope:** turn the remaining P0.1 evidence gaps into explicit owner questions and bounded follow-up gates
> **Exit criteria:** each row below has a named owner, an accepted disposition, and a separately authorized implementation packet where a production change is required
> **Audit entry:** none needed — this is a planning/documentation-only register; it authorizes no cleanup, schema, RLS, grant, Realtime, or analytics change

## Purpose and boundary

The P0.1 inventory and its post-#1185 live verification are complete as
evidence-gathering work. This register does not choose a canonical ledger,
delete or remap data, change policies, or authorize P0.2/P1 implementation. It
only makes the remaining decisions concrete enough for Carl and the relevant
initiative owners to resolve without repeating discovery.

## Decision register

| ID | Evidence already established | Decision needed | Primary owner / reviewers | Safe interim position |
|---|---|---|---|---|
| D-01 | 27 package-related orphan rows: 24 completed/inactive tenant orphans, one active tenant orphan, and two missing-package rows. The counts were reproduced on 2026-09-12. | For each class, retain, restore a missing identity, archive, or separately authorize cleanup. The active orphan needs an explicit operational owner before any action. | TOM / data owner; RBAC review for access impact | Preserve all rows; do not delete, remap, or infer completion from status alone. |
| D-02 | 57 `connected_tenants` rows reference absent tenants but all still reference an existing user; 55 predate 2026 and two are newer. | Decide whether these are historical workspace selections, remappable links, or retired associations, and define retention/cleanup evidence. | TOM / product owner; Client Health reviewer if used analytically | Preserve rows and exclude them from any canonical active-tenant denominator. |
| D-03 | Three orphaned `tga_rto_summary` rows remain: two `current`, one null-status; one lacks a registration end date. | Reconcile current rows to a tenant identity or explicitly classify them as historical/unresolved before remapping or cleanup. | TOM / TGA data owner | No remap or delete; current rows require identity evidence. |
| D-04 | Live `tenant_members` has 936 rows (559 active, 377 inactive), including 349 tenant-orphan rows and zero missing users. `tenant_users` has 576 rows; 570 pairs overlap, only 196 active membership rows overlap, and 363 active rows have no `tenant_users` row. | Ratify the canonical membership ledger and the mapping for role, lifecycle, invitation, relationship, contact flags, access scope, and position type under ADR-019. | TOM; RBAC owns authorization interpretation; Client Health owns analytical provenance | Treat the ledgers as divergent contracts; do not backfill or swap reads. |
| D-05 | `tenant_users` has audit/contact-profile synchronization triggers and contact fields; `tenant_members` has different RLS and only an `updated_at` trigger. | Define the migration/compatibility contract, including trigger-equivalent audit and profile side effects, failure handling, and rollback. | TOM / data and security owners; RBAC review | Keep current writers and RLS unchanged until a separately approved contract exists. |
| D-06 | 60 tenants have an open primary `tenant_csc_assignments` row, while 88 still have `tenants.assigned_consultant_user_id`; 28 tenants differ. | Name the authoritative ownership source and define how ownership history and assignment writes are represented. | TOM / operations owner; RBAC reviewer | Treat CSC assignment as a relationship fact, not an authorization grant; do not reconcile automatically. |
| D-07 | `useTenantNotes` listens for table-wide `notes`/`client_notes` changes, but the live Realtime publications contain none of the scoped tables. A fresh 2026-09-12 query returned no scoped rows. | Decide whether to add publication membership, narrow/change the listener, or explicitly accept polling/staleness, with an owner and rollout test. | TOM / Client Health; Supabase/security reviewer | Do not alter publications or infer realtime freshness from source listeners. |

## Already-resolved security gate

PR #1185 and the 2026-09-12 read-only verification closed the targeted
view/RPC grant and guard findings. Both raw package views remain present but
are inaccessible to `anon` and `authenticated`; their raw definitions are not
safe API contracts. `get_package_burndown` is the tenant-gated replacement,
and the two write RPCs plus `get_tenant_user_capacity` are authenticated-only
with the relevant tenant/identity checks. This register does not reopen that
remediation or propose additional live security changes.

## Sequencing after owner review

1. Record named owners and dispositions for D-01 through D-07.
2. If the decisions require data, RLS, grant, Realtime, or trigger changes,
   create a separate packet with its own authorization, verification, and
   audit entry; this register is not that authorization.
3. Only after the crosswalk decisions are accepted should the program choose
   between TOM P0.2 disposable verification and the next approved P1.1
   identity/lifecycle/ownership contract packet.
4. Do not create a production directory contract from the current overlap
   counts alone.

## References

- [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md)
- [TOM data architecture plan §7/P0.1](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
- [ADR-019 membership target](../../decision-trail.md#adr-019)
- [PR #1185 security remediation](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1185)
