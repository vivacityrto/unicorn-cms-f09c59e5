# RBAC v6 — Packet P1-o: package read-boundary review

> **Last updated:** 2026-09-13 · **Status:** preparation-only review; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-n enrolment read-boundary review](p1-n-aj-csc-enrolment-read-boundary-review.md), [P1-m Academy builder read-boundary review](p1-m-aj-csc-academy-read-boundary-review.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6, with TOM review for package-instance/tenant relationships and product/security review for policy
> **Source baseline:** `origin/main` after PR #1239 (`c441bf914a7b48df3e31fad050042dd73daf7cbf`)
> **Audit entry:** none needed — repository source and migration-history review only

## Purpose and boundary

This packet reviews the next read candidate, `packages.view`, after the
Academy builder and enrolment read surfaces. The review found that this key is
not a live frontend gate in the current source and that “package read” is not
one resource: the same `packages` and `package_instances` relations are read
by tenant management, client views, time/task workflows, Academy mapping,
document flows, ClickUp, Ask Viv, and package-builder code.

The result is a scope correction, not a policy decision. No hosted schema or
policy was queried in this preparation pass, and no role, grant, route, pilot,
RPC, Edge, or production state changed.

## Current source evidence

### No direct `packages.view` enforcement

An exact repository search of `src/` and `supabase/functions/` on the named
baseline found no direct `packages.view` caller. The feature exists in the
historical permission catalogue, but the current source does not connect it to
a page, hook, route, or server boundary. This means the catalogue row cannot
be promoted to a golden row by copying its historical role defaults.

### Package read surfaces are materially different

| Surface | Current source evidence | Review implication |
| --- | --- | --- |
| Academy mapping | `src/hooks/academy/useAcademyPackageRules.ts:45-72` reads active `packages`, published `academy_courses`, and `academy_package_course_rules`; the route uses `academy.mapping.view` at `src/routes/dashboardRoutes.tsx:620-627`. | This is package-course mapping, not necessarily general package visibility. It has its own feature key and write surface. |
| Tenant Academy access | `src/hooks/academy/useTenantAcademyAccess.ts:32-39,112-123,184-193` reads tenant Academy settings, active enrollment tenant IDs, package rules, packages, and courses. | Tenant-access administration combines package catalogue, tenant, enrollment, and mapping data; it cannot inherit a generic package read row. |
| Client package views | `src/hooks/useTenantPackages.ts:34-49` and `src/hooks/useClientPackageInstances.tsx:180-235` read package instances and their package metadata for tenant/client views. | Package instances are tenant-scoped operational resources, distinct from a global package catalogue. TOM owns the relationship proof. |
| Package builder | `src/hooks/usePackageBuilder.tsx:114-274` reads and mutates package definitions and related package-instance/stage data. | Builder reads are adjacent to consequential writes; a view row must not authorize builder administration. |
| Cross-feature lookups | `packages` and `package_instances` reads occur in time capture, task management, document sync, ClickUp, notes, audit, client management, and Ask Viv selectors. | A global `packages.view` key would be too coarse unless resource classes, data sensitivity, and target scope are explicitly split. |

The exact source search also found many reads of `packages` and
`package_instances` but no direct `packages.view` use. That absence is an
evidence finding, not proof that every call is unauthenticated or incorrectly
exposed; each relation's effective RLS/grant and caller context still require
targeted reconciliation.

## Historical server-boundary evidence

The Academy migration history provides useful but non-live context. The
Academy table policies in
`supabase/migrations/20260513023741_76b070c5-74ea-4f42-a139-65d5466e7366.sql`
use broad Vivacity-staff `FOR ALL` policies for Academy-related tables and
separate tenant/user policies for learner-owned data. That history does not
establish the current effective policy for `packages` or `package_instances`,
nor does it answer whether catalogue rows and tenant-owned instances share a
relationship boundary.

Before any golden row, the effective live RLS, grants, view security mode, and
the subject/target resolution for each package resource class must be checked.
The historical permission catalogue's `packages.view` role defaults are not a
substitute for those checks.

## Review disposition

`packages.view` remains **`needs_cross_initiative_contract`**, and the current
single-row name should be treated as a decomposition candidate rather than an
implementation target.

The next packet should first split at least these resource classes:

1. global/package-catalogue metadata (name, type, duration, status);
2. tenant-owned `package_instances` and membership/lifecycle state;
3. package-to-course mapping and Academy entitlement metadata;
4. package/stage/task/document operational detail; and
5. any package-derived Client Health or Ask Viv context, only where a real
   analytical consumer is proven.

For each surviving row, TOM must define the tenant/package/instance
relationship and whether internal staff's broad tenant-read policy applies.
RBAC must define the action and scope; product/security must decide whether
the data class is ordinary read, sensitive learner/client detail, exportable,
or operational administration.

## Required evidence before implementation approval

- direct callers and route/feature gates for the proposed resource class;
- current live RLS and grants for the relation or view;
- server-derived package, instance, tenant, and client relationship proof;
- positive and negative cases for AJ/CSC, ordinary CSC, client, disabled or
  expired principal, wrong tenant, wrong package, and wrong instance;
- whether Realtime or downstream aggregate views are in scope;
- named policy owner, audit behavior, and rollback owner.

No route render or successful catalogue query is an authorization oracle. No
new frontend gate should be added as a side effect of this review, and no
existing route role should be converted mechanically into a package grant.

## Scope intentionally held

This review does not authorize package creation/edit/delete, package-instance
lifecycle changes, assignment, stage application, Academy mapping writes,
Client Health access, role defaults, capability grants, route rewrites, hosted
QA, pilot enrollment, RLS/RPC/Edge changes, or production observation.

## Next review order

`stages.view` remains the next candidate only after TOM supplies the package-
to-stage-to-tenant relationship crosswalk. The current evidence makes a
package resource split more urgent than advancing a broad `packages.view` row;
the safest disposition is to keep it parked at contract definition.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable because no runtime or environment changed.
