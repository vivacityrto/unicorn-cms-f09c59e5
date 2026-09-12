# TOM P1.1 — membership and ownership compatibility scope

> **Last updated:** 2026-09-12 · **Status:** planning/scoping draft; no implementation authorized
> **Parent plan:** [Tenant Operating Model Data Architecture Plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Program index:** [Program Index](../../program-index.md)
> **Evidence:** [Tenant P0.1 Source Inventory](../../../codebase-state/tenant-p0-source-inventory.md)
> **Approved direction:** owner decisions recorded in [PR #1192](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1192)
> **Owner:** TOM, with RBAC and Client Health review
> **Scope:** define the compatibility contract needed to consolidate future membership/access authority around `tenant_members` while preserving current contact, audit, ownership, and analytical behavior
> **Dependencies:** P0.1 owner directions; RBAC capability interpretation; Client Health provenance requirements; no production mutation is implied
> **Exit criteria:** a separately authorized packet has an approved field mapping, writer inventory, persona/RLS parity plan, shadow comparison, rollback plan, and explicit cutover/retirement gates
> **Audit entry:** none needed — this is a planning/scoping document only

## Boundary

This packet is the next design boundary after TOM P0.1. It does not create a
new table, alter a policy or trigger, backfill rows, change a caller, or switch
the directory to a new source. It turns the approved target direction into a
reviewable implementation contract. Any production or disposable-environment
work must be authorized separately with its own verification and audit gates.

## Target semantic split

The preferred end state is one canonical membership/access authority without
forcing unrelated contact semantics into the membership row:

- `tenant_members` owns tenant membership identity, access role, lifecycle
  status, invitation/activation state, and the inputs RBAC uses to resolve
  tenant access.
- Contact relationship, primary/secondary flags, position type, and profile
  synchronization either move to an explicit contact relation or remain
  compatibility-backed until an equivalent target contract is approved.
- `tenant_csc_assignments` owns current CSC relationship/ownership; the legacy
  `tenants.assigned_consultant_user_id` is compatibility/history only and never
  an authorization grant.
- Client Health consumers retain source table, sensitivity, as-of time,
  ownership history, and authorization provenance; overlapping counts are not
  treated as semantic equivalence.

## Contract workstreams

### C-01 — field and lifecycle mapping

Freeze a row-level mapping for every current `tenant_users` field and behavior:

| Current contract | Target decision to freeze | Required proof |
|---|---|---|
| `(tenant_id, user_id)` identity | One canonical membership key; explicit treatment of tenant-orphan rows | Unique-key and orphan reconciliation report |
| `role` plus `relationship_role` | Separate access role from contact relationship; no label-only authorization inference | RBAC-reviewed mapping examples |
| Invitation/activation flows | Define pending, active, inactive, joined, and invitation timestamps without treating current `joined_at` values as history | Acceptance/activation state matrix |
| `primary_contact` / `secondary_contact` | Preserve trigger precedence, null behavior, and profile synchronization | Before/after trigger-equivalence tests |
| `access_scope` | Preserve `full` vs `academy_only` as an explicit scope input | Persona and route/RPC parity checks |
| `position_type` | Assign an owning relation or profile field | TOM ownership decision |
| Audit behavior | Preserve tenant-user audit events and actor provenance | Audit-event parity evidence |
| CSC assignment | Use the assignment table as current owner; retain legacy values only for compatibility/history | 28-row discrepancy disposition |

### C-02 — writer and reader inventory

The implementation packet must enumerate and classify every writer before a
cutover. The known current writers include `TenantUsers`, `TenantUsersTab`,
`invite-user`, `activate-ghost-user`, and `provision-m365-user`, plus the
contact/profile trigger paths recorded in P0.1. For each writer, record:

- fields written and whether the write is direct, RPC-mediated, or Edge-bound;
- actor/persona and effective RLS/security boundary;
- whether it currently writes one or both ledgers;
- side effects, audit rows, and failure behavior;
- target owner after cutover and a rollback action.

No writer may be silently converted because its current table name resembles
the target model.

### C-03 — shadow and parity evidence

Before changing production reads or writers, the packet must define a
read-only/shadow comparison over representative personas and tenant states:

- same-tenant client Admin/User, cross-tenant denial, broad internal staff,
  Team Leader, Super Admin, disabled user, and service principal where
  applicable;
- active, inactive, pending invitation, primary/secondary contact,
  `academy_only`, orphaned, and CSC-mismatch cases;
- membership counts, visible relationship/contact fields, access scope,
  current owner, audit side effects, and error behavior;
- unexplained pair-level divergence threshold of zero for rows selected for
  cutover, with unresolved rows explicitly held out rather than normalized.

The first parity run belongs in a separately authorized disposable or approved
read-only environment. It must not use production writes as fixtures.

### C-04 — staged cutover and rollback

The proposed sequence is:

1. freeze the mapping and unresolved-row holdout list;
2. establish the target read contract or compatibility view without changing
   current callers;
3. run shadow comparisons and verify persona/RLS behavior;
4. migrate writers one bounded family at a time, with explicit failure and
   reconciliation handling;
5. cut over reads only after parity and rollback gates pass;
6. observe the compatibility path for a defined window;
7. retire legacy writers/columns only in a later, separately approved packet.

Permanent dual-write without reconciliation ownership is not an acceptable
end state. A rollback must restore the prior reader/writer path and preserve
audit provenance without deleting evidence.

## Required exit gates

The implementation packet cannot proceed to a production cutover until all of
the following are explicit and approved:

- every current field and writer has a target owner or an explicit hold;
- orphan rows have the approved P0.1 dispositions and are not silently
  backfilled;
- RBAC has approved the authorization interpretation separately from contact
  relationship labels;
- RLS/grant parity is demonstrated for each affected persona;
- audit, contact-profile synchronization, invitation, and activation behavior
  have focused parity evidence;
- shadow comparisons have zero unexplained divergence for the cutover set;
- failure handling, reconciliation, rollback, observation window, and legacy
  retirement criteria are written down;
- any schema, RLS, grant, trigger, Realtime, or production-data change has a
  distinct authorization and audit entry.

## Open questions for packet approval

1. Should contact attributes become a dedicated `tenant_contacts` relation or
   remain behind a compatibility projection during the first cutover?
2. What exact `tenant_members.status` semantics represent pending invitation,
   inactive historical association, disabled user, and revoked access?
3. Should `tenant_members` gain a tenant foreign key as part of a later
   migration, and how are the 349 tenant-orphan membership rows held out?
4. Which writer family is the first safe pilot after shadow parity is proven?
5. What observation window and rollback signal are sufficient to retire legacy
   `tenant_users` writers?

## Explicit non-goals

- no production schema, RLS, grant, trigger, Realtime, or data change;
- no directory implementation or read swap;
- no orphan deletion/remapping;
- no decision that contact relationships equal authorization;
- no Client Health metric denominator chosen from the current divergent counts.
