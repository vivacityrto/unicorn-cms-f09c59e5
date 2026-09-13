# TOM/RBAC P1.3 — legacy Client Parent/Child retirement plan

> **Last updated:** 2026-09-13 · **Status:** planning approved; decisions 1–10 recorded; no implementation or production mutation authorized
> **Parent plan:** [Tenant Operating Model Data Architecture Plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Related packet:** [P1.1 membership and ownership compatibility scope](p1-1-membership-ownership-compatibility-scope.md)
> **Related code contract:** [`relationshipRole.ts`](../../../../../src/lib/roles/relationshipRole.ts)
> **Owners:** TOM (relationship semantics), RBAC (authorization), Client Health (provenance), security (privileged-boundary review)
> **Decision:** Carl approved planning the retirement on 2026-09-13; implementation, migration, and column removal remain separately gated
> **Audit entry:** none needed — planning/documentation only; no schema, RLS, grant, credential, hosted-data, or production change

## Recommendation

Retire `Client Parent` and `Client Child` as authoritative account concepts,
but do not remove them immediately. They are compatibility projections for a
legacy client-admin/client-user split. The durable model is:

1. account class and staff/client boundary;
2. explicit capability and scope decisions owned by RBAC;
3. tenant membership and lifecycle state owned by TOM; and
4. `tenant_users.relationship_role` plus `access_scope` for client relationship
   and portal scope (`primary_contact`, `secondary_contact`, `user`, and
   `academy_user`).

The legacy labels may be derived during a bounded transition. They must not be
used to infer contact ownership, tenant scope, or a product hierarchy.

## Decision record

Carl approved the following planning decisions in sequence on 2026-09-13:

| # | Decision | Recorded direction |
| ---: | --- | --- |
| 1 | Parent/Child is not the account model | Treat the labels as legacy display/compatibility values only |
| 2 | Relationship role is the client access selector | Use primary, secondary, user, or Academy relationship plus scope; derive legacy `unicorn_role` temporarily |
| 3 | Retire duplicate tenant Parent/Child mirrors | Retire `tenant_users.role` parent/child and legacy booleans after relationship parity, not in this packet |
| 4 | Relationship role is per tenant | A person may have a different relationship and scope in each tenant membership |
| 5 | Compatibility values remain temporarily | New writes use explicit relationship data; no direct Parent/Child editing; derive only for unmigrated readers |
| 6 | Mismatches are holdouts | Tenant-less and inconsistent rows require individual classification; no bulk backfill |
| 7 | Do not remove all `user_type` yet | Preserve the broader staff/client compatibility boundary until RBAC defines its replacement |
| 8 | Preserve current contact-management behavior | Primary and secondary contacts retain full portal management during transition; RBAC may later refine capabilities |
| 9 | Migrate behavior before storage | Characterize, migrate readers/writers, shadow, observe, then remove storage representations |
| 10 | Stop adding new Parent/Child dependencies | New UI/API flows accept relationship roles; legacy inputs normalize immediately and are not expanded |

These decisions authorize planning and characterization only. They do not
authorize a role change, backfill, schema/RLS/grant/trigger migration, or
production cutover.

## Why the labels still exist

The current system preserves the labels for four compatibility reasons:

| Compatibility surface | Current dependency | Target direction |
| --- | --- | --- |
| Role trigger and invite/activation writers | `Admin` derives `Client Parent`; `User` and `Academy User` derive `Client Child` in `set_user_type_from_role`, `invite-user`, `activate-ghost-user`, and invitation acceptance helpers | Derive any temporary legacy value from the explicit relationship role; do not use it as the input contract |
| Coarse server gates | `send-password-reset`, `toggle-user-status`, `delete-user`, and `update-user-profile` recognize `Client Parent`/`Client` as tenant-admin compatibility cases | Move authorization to the central capability/tenant-scope decision and retain relationship checks separately |
| RLS compatibility | `tasks_tenants` currently groups `Client Parent` and `Client Child` for tenant access | Replace with the approved membership/access contract, with persona/RLS parity evidence |
| UI and audit compatibility | `TenantUsers`, `ManageUsers`, `UserProfile`, `AdminActions`, and `get_user_audit` display, filter, classify, or report the labels | Display relationship/capability language and preserve historical labels only in explicitly marked compatibility/audit projections |

The distinction is therefore real as a historical access boundary, but it is
not a reliable account hierarchy. The modern relationship helper already
derives `Admin`/`User` and the legacy tenant `parent`/`child` mirror from the
more precise relationship role.

## Evidence baseline

The live production aggregate shows the intended historical mapping:

- 457 `Client Parent` / `Admin` profiles;
- 94 `Client Child` / `User` profiles;
- 47 `Client Child` / `Academy User` profiles;
- 408 `parent` + `primary_contact` + `full` tenant links;
- 66 `parent` + `secondary_contact` + `full` links;
- 35 `child` + `user` + `full` links; and
- 46 `child` + `academy_user` + `academy_only` links.

It also proves the labels cannot remain authoritative: two `Client Child`
profiles have a `parent`/`primary_contact` tenant link, one `Client Parent`
profile has a `child`/null-relationship link, and 51 `Client Child` profiles
have no tenant assignment. These are evidence rows for reconciliation, not
permission or data-correction instructions.

The QA credential seed exposed the same coupling: an Admin persona could not
be provisioned until the QA-only `Client Parent` lookup row existed because
the role trigger derives it. That reference-data dependency is a migration
precondition to document, not a reason to preserve the legacy semantics.

## Canonical target contract

| Question | Canonical source | Legacy field's future status |
| --- | --- | --- |
| Is this a staff or client account? | Explicit account-class/profile boundary, to be frozen with RBAC | Compatibility fallback only |
| What can the actor do? | RBAC capability, resource, scope, and server decision | Never inferred from Parent/Child text |
| Which tenant relationship does the actor have? | `tenant_members` target membership plus `tenant_users.relationship_role` during compatibility phase | `tenant_users.role`/booleans are mirrors only |
| Does the client have full or Academy-only portal scope? | `tenant_users.access_scope` and relationship role | `Client Child` alone is insufficient |
| Who is the primary/backup contact? | `primary_contact`/`secondary_contact` relationship roles and their invariants | Never inferred from `Client Parent` alone |
| What happened historically? | Audit/event records with actor, tenant, relationship, and effective time | Preserve historical labels in immutable evidence where needed |

Promotion should continue to accept an explicit relationship role. The writer
may derive legacy fields while compatibility readers remain, but it must not
silently choose Parent/Child from a display label.

## Bounded retirement sequence

### R1 — freeze inventory and holdouts

Enumerate every direct `user_type` Parent/Child read, write, RLS expression,
view/RPC projection, report, test, and migration. Classify each as authorization,
relationship, display/filter, audit/history, or compatibility. Freeze the
production mismatch/tenant-less holdout list; do not backfill it as part of
retirement.

### R2 — characterize the replacement

Add focused tests for the affected server and UI boundaries. The minimum
matrix covers primary contact, secondary contact, standard user, Academy-only,
disabled, pending invitation, cross-tenant, tenant-less, and mismatched legacy
rows. Run the approved synthetic `unicorn-qa` fixture with Client Admin A,
Client User A, Client Admin B, CSC, and Super Admin personas. Missing operator,
artifact, or service-principal gates remain `Inconclusive`.

### R3 — migrate readers before writers

Move authorization and RLS readers to explicit capability, membership, tenant,
relationship, and scope predicates. Move UI/reporting to relationship labels.
Keep a narrow compatibility adapter for historical callers and derive legacy
values at write boundaries only where an unmigrated reader still requires them.
No permanent unowned dual-write is allowed.

### R4 — shadow and parity window

Compare old and new decisions for the approved persona/tenant matrix. Require
zero unexplained authorization, tenant-scope, portal-scope, audit, and error
behavior divergence for the selected cutover set. Mismatched and tenant-less
rows remain held out with an explicit owner.

### R5 — cut over and observe

Cut over one writer/reader family at a time, with a named rollback signal and
observation window. Preserve audit provenance and make the compatibility path
observable. A rollback restores the prior reader/writer path; it does not delete
or rewrite historical evidence.

### R6 — retire storage representations

Only after the exit gates below pass should a separately authorized migration
remove or deprecate `users.user_type` Parent/Child values and the legacy
`tenant_users.role`/boolean mirrors. The migration must preserve historical
audit meaning, resolve or explicitly quarantine holdouts, and include a dated
audit entry. This packet does not authorize that migration.

## Exit gates

Retirement is not ready until all of the following are true:

- every direct reader/writer has a target owner or an explicit holdout;
- capability authorization no longer depends on Parent/Child text;
- relationship, access scope, and account class are independently represented;
- focused tests cover positive, negative, disabled, pending, cross-tenant, and
  mismatch behavior;
- QA persona/RLS parity is proven for the cutover set;
- production mismatch and tenant-less rows have an approved disposition;
- historical audit/report requirements are preserved;
- the compatibility window, telemetry, rollback signal, and owner are named;
- the service-principal and artifact gates are either completed or explicitly
  marked `Inconclusive`; and
- Carl separately authorizes each schema, RLS, trigger, grant, data, or
  production migration step.

## Explicit non-goals

- no production backfill, deletion, role change, schema change, or RLS change;
- no change to the approved broad internal-staff read decision;
- no assumption that a contact relationship is an authorization grant;
- no removal of `tenant_users` or `users.user_type` in this planning packet; and
- no automatic repair of the observed production mismatch rows.

