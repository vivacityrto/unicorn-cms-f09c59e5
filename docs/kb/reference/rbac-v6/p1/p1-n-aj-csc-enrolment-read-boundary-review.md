# RBAC v6 — Packet P1-n: AJ/CSC enrolment read-boundary review

> **Last updated:** 2026-09-13 · **Status:** preparation-only review; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-m Academy builder read-boundary review](p1-m-aj-csc-academy-read-boundary-review.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [P1-k source-boundary preparation](p1-k-aj-csc-source-boundary-preparation.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6, with TOM review for tenant/learner/course relationships and product/security review for policy
> **Source baseline:** `origin/main` after PR #1238 (`5e482838aad289c31bc80e470959b99324da31b7`)
> **Audit entry:** none needed — repository source and migration-history review only

## Purpose and boundary

Following the approved read-only review order, this packet examines the
`academy.enrolments.view` candidate. It records the actual frontend read graph,
the first server-boundary evidence available in repository migration history,
and the questions that must be answered before a golden row can be approved.

This is not an approval of the existing broad staff behavior. No hosted schema
or policy was queried in this preparation pass, and no role, grant, pilot,
route, RPC, Edge, or production state changed.

## Current entry and caller graph

| Surface | Evidence on `origin/main` | Meaning for the review |
| --- | --- | --- |
| Route group | `src/routes/dashboardRoutes.tsx:608-619` puts `/superadmin/academy/enrollments` under `ProtectedRoute allowedRoles={ACADEMY_BUILDER_ROLES}` (`Team Leader`, `Integrator`, `CSC`; Super Admin is implicitly allowed). | Navigation is granted by a coarse role tier; it is not proof of an atomic v6 view capability. |
| Page read entry | `src/pages/superadmin/AcademyEnrolmentsPage.tsx:117-120` calls `useAdminEnrollments`, `useEnrollmentProgress`, `useEnrollmentFilterOptions`, and `useEnrollmentStats`. | The proposed read row is a composite dashboard surface, not a single table read. |
| Page gates | `AcademyEnrolmentsPage.tsx:126-128` gates create with `academy.enrolments.create`, export with `academy.enrolments.revoke` at `full`, and management with `academy.enrolments.revoke`; there is no direct `academy.enrolments.view` call. | The read surface is exposed independently of an explicit view feature key, while export and mutation gates reuse other action names. |
| Enrollment list | `src/hooks/academy/useAcademyEnrollments.ts:46-81` selects `*` from `academy_enrollments`, then fetches related `academy_courses`, `users`, and `tenants` rows and assembles names, email, avatar, tenant, status, expiry, revoke reason, notes, and timestamps. | A view row would expose learner identity and tenant context as well as enrollment state. It needs an explicit data-sensitivity and scope decision. |
| Progress and stats | `useAcademyEnrollments.ts:84-114` reads `v_academy_course_progress` and calls `fn_academy_enrollment_stats()`. | Progress is learner-activity data; the stats RPC is a separate server boundary and must not be assumed to share table policy. |
| Filters and modal data | `useAcademyEnrollments.ts:414-470` reads course and tenant lists; subsequent `useEnrollableLearners` reads `tenant_users`, `users`, and `tenants`. | Course/tenant catalogue and learner-directory reads are part of the workflow but may require separate rows and relationship semantics. |
| Realtime | `useEnrollmentRealtime` subscribes to enrollment and lesson-progress changes and invalidates list/progress/stats queries. | Realtime publication and event visibility are part of the read contract; a table SELECT result alone does not characterize them. |

## First server-boundary evidence

Repository migration history shows several distinct historical boundaries:

1. `supabase/migrations/20260513023741_76b070c5-74ea-4f42-a139-65d5466e7366.sql`
   defines a `FOR ALL` Vivacity-staff policy on `academy_enrollments`, plus
   tenant-admin SELECT and self/own-user SELECT policies. The staff predicate
   checks `users.user_uuid = auth.uid()` and either a case-insensitive
   `global_role` of `superadmin`/`admin` or `is_vivacity_internal = true`.
2. The same migration defines a `FOR ALL` Vivacity-staff policy on
   `academy_lesson_progress`, plus an own-user policy. This is broader than a
   read-only progress row and can affect Realtime-visible data.
3. `supabase/migrations/20260421085406_b2a157f8-8d30-4b07-8d85-4903a31c66c3.sql:6-35`
   defines `fn_academy_enrollment_stats()` as `SECURITY DEFINER`, grants
   EXECUTE to `authenticated`, and performs an explicit `is_vivacity()` check
   before aggregating all rows in `academy_enrollments`.
4. The enrollment list also reads `users`, `tenants`, and a progress view, so
   their effective grants, RLS, view security mode, and relationship predicates
   must be reconciled independently. The historical migrations are not a
   substitute for the current deployed schema.

The evidence therefore supports “server boundary unresolved,” not a claim
that the existing client or staff behavior is safe, intended, or equivalent to
the future v6 row. The stats function especially requires a current deployed
definition and execute-grant check because `SECURITY DEFINER` code is a
separate authorization boundary.

## Review disposition

`academy.enrolments.view` remains **`needs_enforcement_inventory`**, with a
cross-initiative contract dependency for tenant and learner scope.

Before product/security can approve a golden row, the next evidence packet
must:

1. Reconcile current live RLS, grants, view security mode, Realtime
   publication, and RPC definition/execute grants for the complete read graph.
2. Determine whether the intended row is one composite staff read or separate
   rows for enrollment records, progress/activity, course catalogue, tenant
   catalogue, and learner directory data. Do not inherit `revoke` semantics
   into view or export access.
3. Have TOM define the server-derived relationship for each target: learner,
   course, tenant, package, and any cross-tenant staff context. The permanent
   broad internal-staff tenant-read decision does not by itself authorize
   sensitive learner progress, directory, export, or write access.
4. Define QA-safe positive and negative cases for active AJ/CSC, ordinary CSC
   without a pilot exception, client user, disabled/archived/expired
   principal, and wrong-tenant/wrong-learner requests. Include direct API,
   RPC, and Realtime paths where applicable; a route render is insufficient.
5. Record whether aggregate stats may be visible to the same role/persona as
   row-level enrollment details, and require a separate negative probe for the
   `SECURITY DEFINER` stats function.

## Scope intentionally held

The following are not part of this read review and remain separately gated:

- single and bulk enrollment inserts;
- tenant-wide enrollment expansion;
- revoke, reactivate, extend, lesson administration, and CSV export;
- any route or navigation gate rewrite;
- role defaults, capability grants, AJ/CSC pilot enrollment, telemetry, or
  shadow cutover.

The page currently mixes these actions with the read surface. Their shared
hook does not make them one policy row, and no read review should silently
authorize them.

## Next review order

The next read candidate is `packages.view` only after TOM confirms whether the
package catalogue and package-instance/tenant data are distinct resources.
`stages.view` remains behind the same TOM relationship crosswalk. The current
enrollment candidate cannot advance to implementation-ready status until its
server boundaries and data-scope decision are supplied.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable because no runtime or environment changed.
