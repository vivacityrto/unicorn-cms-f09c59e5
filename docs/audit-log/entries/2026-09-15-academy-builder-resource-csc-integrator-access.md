# Audit: 2026-09-15 — Academy Builder resource management for CSC and Integrator

**Trigger:** Carl requested that CSC users be able to use the Academy Builder
Add Resource feature, then expanded the request to include Integrator users.
The source and live policy paths were inspected before editing.

**Scope:** the existing Academy Builder resource-library and course-resource
link management gate only. No unrelated Academy Builder actions, Academy Solo
access, learner access, package/stage access, or RBAC v6 capability catalogue
rows were changed.

## Finding

`src/lib/academy/courseResources.ts` explicitly mirrored
`public.can_manage_academy_resources()` as Super Admin, Team Leader, and Team
Member only. The Academy Builder page passed that result to
`CourseResourcesSection`, so CSC and Integrator users could enter the builder
but could not see Add Resource or the resource mutation controls.

The live database inspection confirmed that the same function gates SELECT
exceptions and INSERT/UPDATE/DELETE policies for both `public.resource_library`
and `public.academy_course_resources`. A client-only button change would
therefore have been incomplete.

## Correction

- Added `CSC` and `Integrator` to the existing
  `public.can_manage_academy_resources()` function through migration
  `20260915063809_academy_resources_csc_integrator_access.sql`.
- Updated the browser-side helper and its unit test so UI visibility matches
  the database gate.
- Kept BGT and other roles denied by this resource-specific gate; the broader
  `academy.builder.edit` permission remains unchanged.

## Verification

- Live read-only policy inspection confirmed all resource write policies call
  `can_manage_academy_resources()`.
- Migration `academy_resources_csc_integrator_access` (hosted version
  `20260915071001`) was applied to the hosted Supabase project after explicit
  deployment authorization. A live
  function-definition query confirmed the deployed allowlist includes CSC and
  Integrator, and a policy query confirmed the resource SELECT/INSERT/UPDATE/
  DELETE paths still use the centralized gate.
- Focused helper tests cover positive access for CSC and Integrator and
  negative access for BGT and unauthenticated/no-role input.
- Authenticated CSC/Integrator browser verification remains a release follow-up
  because the available local browser session was Super Admin; no resource
  data was created or changed during verification.

## Rollback and residuals

Rollback is a single corrective `CREATE OR REPLACE FUNCTION` restoring the
previous three-role allowlist, followed by the normal migration/release review.
No data backfill or cleanup is required. This is a legacy centralized gate
correction, not the RBAC v6 canonical capability cutover; future v6 migration
must preserve the same approved CSC/Integrator Academy Builder behavior.
