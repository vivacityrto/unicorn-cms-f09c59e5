# RBAC v6 — Packet P1-m: AJ/CSC Academy read-boundary review

> **Last updated:** 2026-09-13 · **Status:** preparation-only review; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [P1-k source-boundary preparation](p1-k-aj-csc-source-boundary-preparation.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6, with TOM review for tenant/package/stage identity and product/security review for policy
> **Source baseline:** `origin/main` after PR #1237 (`c1a49dc217fbd2de491beca900b8592c54e17608`)
> **Audit entry:** none needed — repository source and migration-history review only

## Purpose and boundary

Carl approved the next review boundary: start with the smallest read-only
AJ/CSC Academy/package/stage surface. This packet narrows that review to the
first candidate, `academy.builder.view`, and records the evidence needed before
it can become a golden row. It intentionally does not decide who should get
the capability and does not treat a route allowlist or historical migration as
proof of the current effective server policy.

The review uses source and migration-history reconciliation only. No hosted
database metadata, credentials, QA identity, grant, role, pilot, or runtime
surface was changed or exercised.

## Candidate under review: `academy.builder.view`

### Current entry and caller graph

| Surface | Evidence on `origin/main` | Meaning for the review |
| --- | --- | --- |
| Route group | `src/routes/dashboardRoutes.tsx:608-619` places `/superadmin/academy/builder`, `/superadmin/academy/add-course`, cleanup, import, tags, and the course-detail route under `ProtectedRoute allowedRoles={ACADEMY_BUILDER_ROLES}`. The list is `Team Leader`, `Integrator`, and `CSC`; Super Admin is implicitly allowed by the guard. | This is a coarse navigation boundary shared by several read and write workflows, not an atomic `academy.builder.view` decision. |
| Library read | `src/pages/superadmin/AcademyBuilderLibrary.tsx:176` calls `useAdminAcademyCourses`. The page gates create/backfill actions with `academy.builder.edit` and `academy.builder.publish` at lines 172-173, but has no direct `academy.builder.view` check. | The proposed view row is not directly enforced by a feature-key call in this caller. |
| Course list hook | `src/hooks/academy/useAdminAcademyCourses.ts:41-75` reads `academy_courses`, then counts related `academy_modules`, `academy_lessons`, and active `academy_enrollments` for the returned course IDs. | A single page read crosses four tables; target scope must cover both the course catalogue and the related count data. |
| Course detail read | `src/pages/superadmin/AcademyBuilderCourse.tsx:367-385` reads selectable historical facilitators and `v_academy_course_total_minutes`; the component also reads module/lesson/video and course-reference data in its resource flows. | The detail route is not a view-only surface. A future row must distinguish ordinary course viewing from editor/resource side effects. |
| Adjacent route | The package-course-rules route at `src/routes/dashboardRoutes.tsx:620-627` uses `academy.mapping.view`, not `academy.builder.view`, while its hooks read package/course mappings. | Package mapping is a separate boundary and must not be inherited into the builder view row. |

### First server-boundary evidence

The migration history contains broad staff-only policies for the tables used by
the builder. In `supabase/migrations/20260508092920_dde07ad8-ccdc-41f2-9b56-42b2f97fcaee.sql`:

- `academy_courses` has `FOR ALL` policy `Academy courses: Vivacity staff manage all`;
- `academy_enrollments` has `FOR ALL` policy `Enrollments: Vivacity staff manage all`;
- `academy_lessons` has `FOR ALL` policy `Academy lessons: Vivacity staff manage`;
- `academy_modules` has `FOR ALL` policy `Academy modules: Vivacity staff manage`.

The policy predicate checks a `public.users` row for the authenticated user and
allows `lower(global_role) IN ('superadmin','admin') OR is_vivacity_internal =
true`. This is useful evidence of the historical server boundary, but it is
not a live-schema assertion. It is also materially broader than a future
atomic read capability: `FOR ALL` combines select, insert, update, and delete,
and the source does not establish course/package/tenant relationship proof.

The older helper history also contains `is_vivacity()` checks based on global
staff identity. The later migration above is the relevant source-backed
policy evidence for this review, but the effective deployed policies and
helper bodies still require a read-only live metadata reconciliation before
implementation.

## Review disposition

`academy.builder.view` remains **`needs_enforcement_inventory`**, not
`implementation_ready`.

The evidence supports a finite next probe, but not a policy approval:

1. Reconcile the effective live RLS policies and grants for `academy_courses`,
   `academy_modules`, `academy_lessons`, `academy_enrollments`, the course
   total-minutes view, historical facilitators, and the related detail reads.
2. Identify the server-derived subject and target relationship for a named
   course, including whether a course is global, tenant-owned, or package-
   linked. TOM owns this relationship contract.
3. Separate the read set from the builder's writes and external effects. In
   particular, `academy.builder.edit` and `academy.builder.publish` must not
   be used as implicit evidence for view access.
4. Define a QA-safe positive read case and negatives for wrong tenant/course,
   client principal, disabled/archived/expired principal, and route bypass.
   Each case must record the trusted boundary, decision reason, and error or
   empty-result behavior.
5. Have product/security name the action owner, scope kind, relationship
   proof, and whether the intended row covers the entire library/detail read
   set or only a narrower catalogue/read surface.

No browser route render is an authorization oracle. No row becomes golden
until the server boundary, target relationship, positive/negative evidence,
and policy owner are recorded.

## What this review does not authorize

This packet authorizes no role default, capability grant, route/nav rewrite,
RLS/RPC/Edge change, hosted QA, pilot enrollment, telemetry/logger, migration,
or production observation. It also does not authorize broadening access based
on the existing `ACADEMY_BUILDER_ROLES` allowlist or the historical `FOR ALL`
staff policies.

## Next review order

After the `academy.builder.view` server-boundary and relationship evidence is
available, review `academy.enrolments.view` as the next read candidate. Keep
`packages.view` and `stages.view` behind the TOM package/stage relationship
crosswalk. Do not advance builder or enrolment writes in the same review: the
existing source bundles ordinary editing, publish/archive, backfill, direct
inserts, and tenant-wide expansion under different contracts.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable because no runtime or environment changed.
