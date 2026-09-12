# TOM P0.1 — owner-disposition checklist

> **Last updated:** 2026-09-12 · **Status:** planning/evidence reconciliation; no production change authorized
> **Owner:** TOM, with RBAC and Client Health review
> **Evidence:** [Tenant P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md)
> **Related execution boundary:** [P1.2-b guarded dry-run execution packet](../p1/p1-2-b-ghost-contact-dry-run-execution-packet.md)

## Purpose and boundary

The P0.1 inventory has evidence for the current source, writers, security
boundaries, orphan populations, and cross-initiative dependencies. This
checklist turns the remaining unresolved findings into explicit owner decisions
or explicit holds so P0.1 can close its evidence-gathering portion without
silently turning an observation into a cleanup, migration, authorization, or
analytics change.

This document proposes conservative dispositions for review. It does not
authorize deletion, remapping, backfill, schema/RLS/grant/Realtime changes,
directory implementation, Edge Function retirement, or production queries.

## Recommended disposition matrix

| Finding | Evidence | Recommended interim disposition | Decision owner / required evidence |
| --- | --- | --- | --- |
| 1 active orphaned `package_instances` row | `is_complete=false`, `is_active=true`, `membership_state='active'`, tenant missing | Hold; reconcile tenant/package identity before any write or status change | TOM + package owner; source mapping and rollback plan |
| 24 completed inactive package-instance tenant orphans | Complete/inactive rows, all created 2026-03-03 | Preserve as historical evidence; do not delete automatically | TOM + audit owner; retention/archival policy |
| 2 cancelled package-instance rows with missing package | Complete/inactive/cancelled, package absent | Preserve pending package-identity reconciliation | TOM + package owner; confirm whether absence is expected historical state |
| 57 orphaned `connected_tenants` rows | All still map to users; 55 pre-2026 and 2 newer | Retain pending owner classification; no inferred cleanup | RBAC/TOM; define stale-selection vs historical assignment and owner of deletion |
| 3 orphaned `tga_rto_summary` rows | Two current, one null status; January fetches; one missing registration end | Reconcile tenant identity and freshness before any cleanup/remap | TOM + TGA owner; source tenant mapping and refresh policy |
| `tenant_users`/`tenant_members` divergence | Distinct ledgers, 349 tenant-orphan membership rows, relationship fields only in legacy ledger | Keep both ledgers readable; freeze migration boundary until crosswalk and holdout list are approved | TOM; RBAC capability interpretation and Client Health provenance review |
| CSC ownership discrepancy | Legacy consultant column differs from open primary assignment rows; 28-row discrepancy recorded | Treat `tenant_csc_assignments` as current ownership evidence, but do not rewrite legacy values | TOM ownership owner + RBAC; effective-date/history and UI/RPC mismatch disposition |
| Realtime publication mismatch | Scoped tables absent from live publication; `useTenantNotes` listener remains source-intended behavior | Record as an operational gap; do not add publication membership from this inventory | TOM + Client Health; table, policy, volume, freshness, and rollback review |
| `activate-ghost-user` retirement | No invocation in prior 24-hour review, but complete historical/job evidence is not yet proven | Keep legacy path gated; finish repository/job/log zero-caller evidence before retirement | TOM + operations; complete history, worker census, observation window |
| Four #1185 security objects | Live grants/guards rechecked on 2026-09-12 | Mark P0 evidence closed for these objects; do not reopen remediation here | RBAC/security; retain linked audit evidence |

The recommended posture is preserve-and-hold for every row except the already
verified #1185 security remediation. “Hold” means the row remains visible in
the evidence and is excluded from any future candidate/apply set until its
owner signs a separate disposition.

## Required owner decisions

P0.1 can close its evidence-gathering portion when each item below has a named
owner, a written disposition, and an evidence reference:

1. **Package orphans:** confirm whether the active row needs identity
   reconciliation, and whether the completed/cancelled rows are retained as
   historical records or moved by a separately approved archival operation.
2. **Connected tenants:** define whether stale historical selections have any
   authorization or audit meaning. The answer must not infer deletion merely
   from age or absent tenant identity.
3. **TGA summaries:** establish the canonical tenant mapping and freshness
   behavior for current rows before considering remap or cleanup.
4. **Membership crosswalk:** approve the tenant/member/contact compatibility
   holdout list, including the 349 tenant-orphan membership rows, without
   treating relationship labels as authorization grants.
5. **CSC ownership:** resolve the legacy-column versus assignment-table
   discrepancy and the Team-Leader UI versus Super-Admin RPC boundary as
   separate ownership and authorization questions.
6. **Realtime:** decide whether the listener is intended to be live behavior;
   if yes, open a separate packet for publication/policy parity and direct
   persona verification. If no, characterize removal separately rather than
   silently leaving a false freshness signal.
7. **Ghost retirement:** approve the historical zero-caller evidence standard,
   observation window, rollback owner, and retirement packet boundary. The
   merged read-only dry-run CLI is evidence preparation only.

## Cross-initiative review contract

The same rows must not be re-characterized independently by each initiative:

- TOM owns identity, lifecycle, membership/contact compatibility, ownership,
  and source-of-truth dispositions.
- RBAC owns capability interpretation, tenant/staff scope, role semantics,
  and server-side authorization parity. A relationship role is not an access
  grant by implication.
- Client Health owns analytical provenance, source freshness, historical
  ownership, sensitivity, and denominator/attention semantics. It must not
  treat divergent membership ledgers or notes stores as interchangeable.

Any future packet that touches a row in this matrix must link this checklist,
reuse its evidence, and update only the disposition it actually resolves.

## P0.1 closure test

P0.1 is ready to close only when:

- every displayed field, writer, view/RPC boundary, and identified orphan class
  has a source, security boundary, owner, and disposition or explicit hold;
- no proposed disposition relies on a guessed tenant mapping, inferred delete
  intent, or relationship-to-authorization shortcut;
- all cross-initiative rows have one shared characterization and linked owner
  review; and
- the remaining implementation work is represented by separately authorized
  P1 packets with their own shadow, parity, rollback, and production gates.

This closure test is documentary. It does not authorize the dry-run,
backfill, cleanup, migration, Realtime change, or legacy Edge Function
retirement.

**Audit entry:** none needed — evidence reconciliation and planning only; no
schema, permission, production-data, or operational schedule changed.
