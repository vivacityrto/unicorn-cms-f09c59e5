# RBAC v6 — Packet P1-k: AJ/CSC source-boundary preparation

> **Last updated:** 2026-09-13 · **Status:** preparation-only source inventory; no capability, role, route, RLS, RPC, Edge, or production change authorized
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-d enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-i job-role defaults/AJ/CSC pilot](p1-i-job-role-defaults-aj-csc-pilot.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md)
> **Program index:** [Program Index](../../program-index.md)
> **Source baseline:** `origin/main@93633da59ce735c569955e462c79a69d985fab20`
> **Owner:** RBAC v6, with TOM review for tenant/package/stage identity and Client Health review only where an analytical consumer is proven
> **Audit entry:** none needed — repository source analysis only; no permission, role, database, credential, deployment, or live-data change

## Purpose and boundary

P1-i names four minimum initial AJ/CSC read candidates — Academy builder,
Academy enrolments, packages, and stages — before any write is considered.
This packet independently traces their current route, frontend gate, direct
data, and mutation boundaries so the golden matrix does not mistake a route
allowlist or a page's local button state for server authorization.

The result is an evidence ledger and a list of exact follow-up probes. It does
not add missing view gates, alter existing feature keys, change RLS/RPC/Edge
behavior, assign a role, enroll a pilot user, or select pilot tenants.

## Method

The inventory was performed against the named `origin/main` commit using
repository search and direct source reading of route modules, pages, hooks,
and Edge entrypoints. A source reference is evidence of a caller or UI guard,
not proof that the effective server boundary allows or denies the same action.
The next packet must reconcile each row with RLS/policy definitions, RPC or
Edge identity checks, resource-to-tenant binding, and synthetic positive and
negative cases.

## Candidate-row boundary ledger

| Candidate row | Current entry point and route boundary | Direct reads/writes observed | Current evidence state | Required next proof |
|---|---|---|---|---|
| `academy.builder.view` | `/superadmin/academy/builder` and `/superadmin/academy/builder/:courseId` sit under `ProtectedRoute allowedRoles={ACADEMY_BUILDER_ROLES}` in `src/routes/dashboardRoutes.tsx`; no `usePermission('academy.builder.view')` call was found | `AcademyBuilderLibrary` consumes `useAdminAcademyCourses`; `AcademyBuilderCourse` reads `academy_courses`, internal facilitator users, historical facilitators, and `v_academy_course_total_minutes` | **Needs enforcement inventory.** The route allowlist is a UX/route boundary, not a v6 capability decision; the exact view row is not directly keyed in source | Identify effective RLS for each relation, route-role membership, tenant/resource scope, and non-AJ/CSC denial behavior; decide whether a dedicated view capability is required |
| `academy.builder.edit` | Same builder route group; `AcademyBuilderLibrary`, `AcademyBuilderCourse`, and `AcademyAddCoursePage` call `usePermission('academy.builder.edit')` for edit/create controls | Direct `academy_courses` updates/inserts; module/lesson/assessment/question writes; thumbnail storage writes; `academy-ai-generate` and Vimeo-related function calls | **Source-backed frontend gate; server boundary unresolved.** Several writes are grouped under one edit key and include external/AI side effects | Map every write to its table/RPC/Edge/RLS boundary, separate ordinary edit from create and external side effects, and prove tenant/resource scope plus unauthorized denial |
| `academy.builder.publish` | `AcademyBuilderLibrary` uses it for duration backfill; `AcademyBuilderCourse` uses it for publish/delete controls; `AcademyAddCoursePage` uses it for publish-on-save | Course status updates, delete/archive branches, Vimeo backfill invocation, and publish-on-save flow | **Source-backed frontend gate; bundled-risk review required.** Publish, destructive delete/archive, and maintenance backfill are not equivalent actions | Trace each server boundary and failure/audit behavior; split publish, archive/delete, and backfill into atomic rows with separate negative cases |
| `academy.enrolments.view` | `/superadmin/academy/enrollments` is under the same `ACADEMY_BUILDER_ROLES` route allowlist; no direct `academy.enrolments.view` gate was found | `useAdminEnrollments` reads `academy_enrollments`, `academy_courses`, `users`, `tenants`; progress view and stats RPC are also read; filter options read courses, tenants, tenant users, and users | **Needs enforcement inventory.** A broad role route currently carries the read surface; no explicit v6 view row is evidenced | Verify RLS and RPC caller checks, whether internal staff scope is intentionally broad, and client/disabled/wrong-tenant denials; decide the exact read capability and resource scope |
| `academy.enrolments.create` | `AcademyEnrolmentsPage` calls `usePermission('academy.enrolments.create')` before exposing create/bulk-enrol actions; route still relies on the role allowlist | `useEnrollUser` inserts one row; `useBulkEnroll` upserts course/user pairs; `useEnrollTenant` reads `tenant_users` then inserts rows into `academy_enrollments` | **Needs enforcement inventory.** Frontend gate exists, but direct inserts and tenant-user expansion have different target and scope semantics | Prove server-side actor/tenant binding, duplicate/idempotency behavior, cross-tenant denial, and whether tenant-wide enrollment is a separate high-risk action |
| `academy.enrolments.revoke` | `AcademyEnrolmentsPage` calls it for revoke/reactivate management; the same key at `minLevel='full'` controls CSV export | Revoke/reactivate/extend use admin RPCs; lesson/certificate management in the same hook reaches additional admin RPCs | **Needs decomposition and server review.** A revoke key is reused for export and the hook contains several consequential operations | Separate revoke, reactivate, extend, certificate, lesson-admin, and export rows; verify each RPC's caller/target checks, audit, and negative cases |
| `packages.view` | No direct `usePermission('packages.view')` or equivalent feature-key gate was found in the Academy package-rule path | `usePackagesActive` reads active `packages`; `useAcademyBuilderPickers` reads package options; package-instance reads are used to find affected tenants | **Needs cross-boundary inventory.** The Academy package-course rules route is gated by `academy.mapping.view`, not `packages.view` | Define whether package catalogue reads and package-instance/tenant reads are separate resources; reconcile route/gate intent with TOM package authority and RBAC scope |
| `stages.view` | No direct `stages.view` feature-key gate was found in the inspected stage editor path; stage admin routes are protected by their existing route tiers | `useStageVersions` reads `stage_versions` and `package_stages`; stage detail paths read stage/package/task/document relations | **Needs enforcement inventory and TOM ownership review.** Stage identity is tenant/package-linked and cannot be classified from the page route alone | Map stage-to-package-to-tenant binding, RLS and RPC boundaries, client/staff scope, and the read denial case before adding a golden row |
| `stages.publish` | No direct `stages.publish` feature-key gate was found in `useStageVersions` or the inspected stage route | `publish_stage_version` RPC, `get_stage_version_diff`, and `apply_stage_version_to_package`; certification/editability checks also participate | **Needs security and cross-initiative review.** Publishing/applying a version can affect multiple packages and client work | Establish exact target/resource semantics, certification and package impact, RPC authorization, audit/rollback behavior, and sensitive-negative probes |

## Concrete observations affecting the golden matrix

1. The Academy builder and enrolment read pages are reachable through the
   `ACADEMY_BUILDER_ROLES` route allowlist even where the proposed `*.view`
   feature key has no direct caller. This is not proof of an authorization
   defect, but it means a route role cannot be copied into a golden capability
   row without server-boundary evidence.
2. `academy.enrolments.revoke` is used as the full-level gate for CSV export.
   Export and revocation have different risk and target semantics and must not
   share a golden row by inheritance.
3. The package-course rules route uses `academy.mapping.view` at the route
   boundary while its hook reads and writes package/course rule data. That is
   evidence of a mapping/package boundary to reconcile, not evidence that
   `packages.view` is already enforced.
4. Stage publication is mediated by named RPCs, but the inspected caller does
   not supply a `stages.publish` feature key. RPC definitions and policies are
   therefore the first privileged boundary to characterize before proposing a
   pilot write.
5. Direct frontend writes in the builder and enrolment paths are not a safe
   substitute for a server decision core. A missing or broad UI gate must not
   be repaired by granting a wider role or by assuming RLS is equivalent to
   the future v6 action/scope/relationship row.

## Cross-initiative ownership and pilot implications

- **TOM** owns tenant identity, package/stage relationship, membership and
  ownership semantics. An assigned-tenant label is not permission proof.
- **RBAC** owns the action vocabulary, scope, relationship requirement,
  delegability, server-boundary classification, and negative cases.
- **Client Health** joins only if a real health/activity/Ask Viv consumer is
  affected; Academy access itself is not a health authorization row.
- The minimum read pilot can proceed to matrix preparation only with rows
  whose server target and relationship proof are explicitly recorded. The
  current source evidence does not make any of the four candidates
  `implementation_ready`.

## Required synthetic cases before implementation approval

The next evidence packet should use QA-safe synthetic identifiers and cover:

| Persona/state | Required cases |
|---|---|
| Active AJ/CSC candidate | Allowed read for each approved named resource; wrong tenant and wrong package/stage denied |
| Active CSC without pilot exception | Existing baseline reads only; pilot-only writes denied |
| Client Admin/User | Own approved learning read, no builder/enrolment administration, no other-tenant read |
| Disabled/archived/expired principal | All candidate rows deny, including cached/replayed request |
| Super Admin | Explicit hard-control read/write where policy permits; no use as a substitute for normal-seat evidence |
| Machine/service principal | Only its fixed named workflow; no browser or human-role reuse |

Each case needs the effective boundary, decision reason, target tenant/resource,
and audit/error behavior. A page render or route reachability check alone is
not an authorization oracle.

## Disposition

This packet clears no capability row for granting or pilot enrollment. It
clears source-backed preparation for the golden-matrix review and identifies
the first server-boundary probes. The conservative disposition is:

- keep all four initial read candidates in `needs_enforcement_inventory`;
- keep builder/enrolment writes out of the pilot until their atomic action and
  target contracts are split;
- keep package and stage rows in `needs_cross_initiative_contract` until TOM
  identity/relationship evidence is joined; and
- do not add a frontend gate or change a role as a side effect of this packet.

## Verification

Documentation-only packet. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
No frontend, Edge, database, authorization, credential, hosted-QA, or live
verification is applicable because no runtime behavior changed.
