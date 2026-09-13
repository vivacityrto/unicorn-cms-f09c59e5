# RBAC v6 — Packet P1-q: AJ/CSC live read-boundary reconciliation

> **Last updated:** 2026-09-13 · **Status:** preparation-only live metadata reconciliation; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-p stage read-boundary review](p1-p-aj-csc-stages-read-boundary-review.md), [P1-o package read-boundary review](p1-o-packages-read-boundary-review.md), [P1-n enrolment read-boundary review](p1-n-aj-csc-enrolment-read-boundary-review.md), [P1-m Academy builder read-boundary review](p1-m-aj-csc-academy-read-boundary-review.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6, with TOM review for package/stage/tenant relationships and product/security review for policy and privileged RPCs
> **Source baseline:** `origin/main` at `2f43c8bc04145f58634693a5ba9823604f4c3344` (after PR #1241)
> **Live evidence cutoff:** read-only Supabase metadata queried 2026-09-13
> **Audit entry:** none needed — read-only metadata observation; no schema, policy, grant, function, or production state changed

## Purpose and boundary

The four initial AJ/CSC read candidates now have both source and current
deployed-boundary evidence. This packet reconciles the live relation security,
policies, grants, view security mode, relevant RPC execution grants, and
Realtime publication metadata for the relations identified by the source
reviews.

This is evidence, not an authorization decision. It does not approve a broad
`academy.builder.view`, `academy.enrolments.view`, `packages.view`, or
`stages.view` row. No actor probe, browser workflow, policy change, migration,
RPC change, role/capability change, or hosted QA run was performed.

## Method

The live project was queried read-only through PostgreSQL catalog metadata:

- `pg_class` for relation kind and RLS/forced-RLS state;
- `pg_policies` for effective policy role, command, and expressions;
- `has_table_privilege` and relation ACL metadata for `anon` and
  `authenticated` table/view privileges;
- `pg_views`/relation options for the definitions and security-invoker mode
  of the two relevant views;
- `pg_proc` and routine ACLs for relevant stage and Academy RPC execution;
- `pg_publication_tables` for Realtime publication membership.

The catalog output is current-state evidence only. A grant is not equivalent
to an effective data read: policy applicability, the caller's JWT, helper
function behavior, and view invocation context still have to be tested with
approved positive and negative QA-safe principals before any enforcement row
is considered ready.

## Current relation security

All ten inspected public relations have RLS enabled except the two views,
where direct RLS is not applicable. `package_instances` is the only inspected
base table with forced RLS enabled. The current catalog state is:

| Relation | Kind | RLS | Forced RLS | Current read-boundary observation |
| --- | --- | --- | --- | --- |
| `stages` | table | enabled | no | authenticated unconditional `SELECT` policy (`qual=true`) is present; this is catalogue-wide, not a tenant relationship proof. |
| `package_stages` | table | enabled | no | authenticated unconditional `SELECT` policy (`qual=true`) is present; the historical permissive read is confirmed live. |
| `stage_versions` | table | enabled | no | authenticated unconditional `SELECT` policy (`qual=true`) is present; version-history sensitivity remains unresolved. |
| `client_package_stages` | table | enabled | no | current `SELECT` policy is tenant-member/client-package scoped or Super Admin. |
| `packages` | table | enabled | no | authenticated unconditional `SELECT` policy (`qual=true`) is present; ACL metadata showed no anon SELECT privilege and authenticated SELECT privilege. |
| `package_instances` | table | enabled | **yes** | current `SELECT` policy uses `app.user_can_access_tenant(tenant_id)` or `is_super_admin()`. |
| `academy_enrollments` | table | enabled | no | current `SELECT` policy is self, qualifying tenant contact, or Vivacity internal/admin; it is materially narrower than a catalogue-wide read. |
| `academy_lesson_progress` | table | enabled | no | current `ALL` policy is learner self or Vivacity staff. It combines read and write authority and should not be treated as a read-only capability proof. |
| `v_client_package_stages` | view | not applicable | not applicable | `security_invoker=true`; underlying invoker table policies apply, but the view exposes client/package stage-instance data. |
| `v_academy_course_progress` | view | not applicable | not applicable | `security_invoker=true`; underlying invoker table policies apply, but the view exposes learner identity, tenant, progress, and certificate fields. |

The catalog also reports broad table ACLs for `anon` on several relations,
including some relations whose visible SELECT policies target
`authenticated`. That apparent ACL/policy mismatch is not enough to claim
anonymous data access, because effective access depends on policy role and
the actual request identity. It is a security-review follow-up requiring
explicit anonymous and authenticated denial/allow probes; it was not probed
or changed here.

## Detailed live findings

### Academy builder and enrolments

The live `academy_enrollments` policy confirms a relationship-sensitive read
boundary for direct enrollment rows: the learner, qualifying tenant contact,
or Vivacity internal/admin can pass the displayed policy. The staff branch is
broad across tenants, so TOM's internal-staff tenant-visibility semantics
still matter before this becomes an AJ/CSC capability row. The progress table
uses a staff-or-owner `ALL` policy, which means a future read capability must
not accidentally inherit learner write authority.

The `v_academy_course_progress` view has `security_invoker=true` and its live
definition exposes enrollment and learner identifiers, tenant ID, enrollment
status, course metadata, lesson counts/progress, last activity, and
certificate fields. This is a sensitive composite read, not merely a course
catalogue read. The view's underlying relation policies and the aggregate RPC
must be tested as one workflow.

`fn_academy_enrollment_stats()` is `SECURITY DEFINER`, executable by
`authenticated`, and its current definition explicitly checks
`public.is_vivacity()` before aggregating Academy enrollments. That is useful
server-side evidence, but it does not by itself decide whether the frontend
aggregate belongs under `academy.enrolments.view` or a narrower analytics
capability.

### Packages and stages

The live unconditional authenticated reads on `packages`, `stages`,
`package_stages`, and `stage_versions` confirm that the historical catalogue
read surface is still broad in the deployed project. This is not proof that a
single broad capability is desirable: source review shows these relations
serve global templates, package mappings, tenant/client instances, Academy,
documents, tasks, ClickUp, and Ask Viv.

The live `v_client_package_stages` view is invoker-secure and exposes
tenant/package-instance stage state, dates, status, node state, and stage
metadata. Its boundary is therefore different from the global `stages` and
`package_stages` catalogue reads. The live `package_instances` policy adds a
tenant access helper or Super Admin check, which is a stronger boundary than
the unconditional catalogue policies but still needs helper-function and
negative-principal verification.

The stage-related routines
`publish_stage_version`, `get_stage_version_diff`,
`apply_stage_version_to_package`, and `can_edit_certified_stage` are live as
`SECURITY DEFINER` functions with `authenticated` execute privilege. In the
returned current definitions, unlike the enrollment-statistics function, no
explicit caller guard was visible before the privileged stage read/write
logic. This is a security-review finding requiring a separate authorized
effective-boundary probe and remediation decision. It must not be papered
over by a frontend `stages.view` gate, and this packet makes no change to it.

### Realtime

None of the inspected relations—`stages`, `package_stages`,
`stage_versions`, `client_package_stages`, `academy_enrollments`, or
`academy_lesson_progress`—appeared in the current Realtime publication
metadata. Any frontend subscription that assumes Postgres changes from these
tables will therefore need a separate runtime/operational explanation or
verification. This is a deployment fact, not proof that every observed UI
workflow is broken; alternate channels and explicit refreshes remain possible.

## Reconciled disposition

The four source-review dispositions remain unchanged, but the reason is now
stronger and current-state based:

| Candidate | Disposition after live reconciliation | Why it is not implementation-ready |
| --- | --- | --- |
| `academy.builder.view` | `needs_enforcement_inventory` | Builder routes and hooks span Academy catalogue, mapping, tenant access, and writes; the relevant catalogue tables are broadly readable while learner/progress data is separately scoped. |
| `academy.enrolments.view` | `needs_enforcement_inventory` | Direct enrollment reads are relationship-sensitive, but the composite progress view, staff branch, Realtime absence, and aggregate RPC need named resource/action boundaries. |
| `packages.view` | `needs_cross_initiative_contract` | Live `packages` reads are catalogue-wide for authenticated users, while package instances are tenant-scoped; one key cannot safely represent both. |
| `stages.view` | `needs_cross_initiative_contract` + `needs_enforcement_inventory` | Live catalogue reads are unconditional for authenticated users, client instances are scoped, and privileged stage RPCs need explicit security review. |

## Required next gates

Before any of these candidates can become a golden row or implementation
packet:

1. TOM must define the package → stage → instance → tenant/client
   relationship and the intended internal-staff visibility model.
2. RBAC must split catalogue, mapping, instance, learner/progress,
   version-history, and aggregate-analytics resources by action and scope.
3. Product/security must review the authenticated catalogue policies, the
   apparent anon ACL/policy mismatch, the four stage `SECURITY DEFINER`
   routines, and the missing Realtime publication entries.
4. A separate, explicitly authorized QA packet must run positive and negative
   probes for AJ/CSC, ordinary CSC, client, disabled/expired principals,
   wrong tenant/package/instance, direct view access, and direct RPC access.
5. Any policy, grant, RPC, Realtime, migration, or production remediation
   must be separately authorized and documented; this packet does not grant
   that authority.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
mutation verification are not applicable because no runtime or environment
changed. The live metadata query itself was read-only.
