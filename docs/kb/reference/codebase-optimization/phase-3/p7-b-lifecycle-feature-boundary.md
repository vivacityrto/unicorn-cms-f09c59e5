# P7-B Lifecycle Feature-Boundary Preparation

> **Status:** implemented minimal type boundary; no runtime, authorization,
> schema, RLS, or production-data change
>
> **Parent packet:** Phase 2.6 P7-B — minimal feature boundary
>
> **Prerequisite:** P7-A characterization merged in PR #1049

## Purpose and non-goals

This packet records the smallest boundary that followed the lifecycle checklist
characterization. The existing `requireSuperAdmin` route guard, current
database enforcement, and all lifecycle instance workflows remain unchanged;
the approved RBAC vocabulary and staff-scope decisions authorize only this
type-only boundary.

Out of scope are a generic feature framework, a new permission registry,
tenant lifecycle transitions, checklist-instance mutation, schema/RLS/grant
changes, Edge deployment, and changes to the staff onboarding workflow.

## Current consumer and contract map

| Surface | Current source | Boundary finding |
| --- | --- | --- |
| Admin route | `src/routes/dashboardRoutes.tsx` → `LifecycleChecklistsAdmin` | One lazy route, inside the shared `ProtectedRoute requireSuperAdmin` group; route policy must remain authoritative. |
| Admin orchestration | `src/pages/admin/LifecycleChecklistsAdmin.tsx` | Owns active tab, category grouping, counterpart mapping, dialog state, and mutation callbacks. Keep these page concerns local. |
| Query/mutation hook | `src/hooks/useLifecycleChecklists.ts` | Owns dropdown reads, template list read, three template mutations, React Query keys/invalidation, and toasts. This is the candidate seam, but splitting every concern would add boilerplate. |
| Display grid | `src/components/admin/lifecycle/LifecycleTemplateGrid.tsx` | Pure display/action callbacks; imports `LifecycleTemplate` as a type from the feature boundary. No data fetching or authorization. |
| Edit/add dialog | `src/components/admin/lifecycle/LifecycleTemplateDialog.tsx` | Pure form state and payload construction; imports `LifecycleTemplate` and `LifecycleDropdownItem` as types from the feature boundary. No data fetching or authorization. |
| Staff onboarding hub | `src/hooks/useOnboardingHub.ts` | Separate query and instance mutation contract. It does not import the admin hook or admin types. Do not fold it into this boundary. |
| Staff self-onboarding | `src/pages/MyOnboardingPage.tsx` | Separate direct reads and note mutation over checklist instances. Do not fold it into this boundary. |
| Checklist generation | `supabase/functions/generate-staff-checklist/index.ts` | Server-side template read and instance insert; independent Edge contract and authorization. Do not change it in P7-B. |

The hook now has one production runtime importer in `src/` (the admin page).
The grid, dialog, page, and characterization test consume feature-local types
directly; the hook re-exports those types to preserve its existing API.
`LifecycleInstance` remains a compatibility re-export with no production
importer and was not expanded. The focused P7-A test remains the behavioral
characterization oracle.

## Smallest safe candidate

The approved implementation is limited to:

1. Move the UI-facing value shapes (`LifecycleTemplate` and
   `LifecycleDropdownItem`) into `src/features/lifecycle/types.ts` as aliases
   to generated Supabase row types, after confirming the shapes match.
2. Preserve the hook's existing type exports as compatibility re-exports while
   moving page, grid, dialog, and test imports to the feature boundary.
3. Do not introduce a query/mutation adapter: the page already has no direct
   Supabase knowledge, so an adapter would add boilerplate without reducing
   coupling.
4. Leave React Query lifecycle, toast behavior, query keys, and mutation
   invalidation in one place. Do not split these into generic repositories.
5. Keep `LifecycleTemplateGrid` and `LifecycleTemplateDialog` callback-driven;
   they are already the display-only core for this feature. No genuinely
   shared display core with onboarding or other modules was found.

The adapter must preserve the current query contract: three active dropdown
lists ordered by `sort_order`; template reads ordered by `category` then
`sort_order` and filtered by the selected text lifecycle code; create/update
return the inserted row; deactivate is a soft update of `is_active = false`;
successful mutations invalidate `lifecycle-templates`; and error toasts retain
the current messages.

## Implementation-readiness snapshot

Measured before implementation from `origin/main@81cef2ac0` on 2026-09-09 and
rechecked after the change. This is the implementation evidence for the
minimal boundary, not a claim that broader lifecycle or RBAC work is complete.

| Surface | Physical lines | Production import evidence |
| --- | ---: | --- |
| `src/hooks/useLifecycleChecklists.ts` | 142 | runtime-imported by the admin page; lifecycle types remain compatibility re-exports |
| `src/pages/admin/LifecycleChecklistsAdmin.tsx` | 204 | lazy-loaded by the lifecycle route |
| `src/components/admin/lifecycle/LifecycleTemplateGrid.tsx` | 139 | callback-driven display/actions only |
| `src/components/admin/lifecycle/LifecycleTemplateDialog.tsx` | 176 | callback-driven form/payload construction only |
| `src/features/lifecycle/types.ts` | 11 | generated-type aliases for the lifecycle feature boundary |
| `src/test/admin/lifecycle-checklists.test.tsx` | 322 | 13 characterization tests; not production reachability |

The repository-wide architecture script reports 1,711 product files, 480,168
physical lines, 407,130 lines excluding generated types, and 394,245 lines
excluding generated types and tests both before and after this change. The
boundary therefore adds no measurable architecture overhead; it removes the
manual UI type definitions and leaves the only runtime dependency edge at the
admin page. The `LifecycleInstance` export still has zero production consumers.

## Behavioural parity matrix for the implementation PR

The existing characterization suite is the oracle. A boundary change must keep
each row green without broadening the route or database policy.

| State or interaction | Current observable contract | Required parity assertion |
| --- | --- | --- |
| Loading | grid renders skeleton rows while the template query or dropdowns are pending | preserve skeleton count/role and disabled add action when no tab exists |
| Empty | selected lifecycle tab renders the empty-state message and no step cards | preserve selected text lifecycle code and empty-state copy |
| Populated/inactive | rows group by category order; labels resolve through dropdowns; inactive rows remain visible with status treatment | preserve category ordering, label fallback, inactive treatment, and action callbacks |
| Tab/filter | first active lifecycle type is selected; changing a tab re-runs the template query with that code | preserve query key/filter and four current lifecycle codes |
| View/external link | view dialog shows description, category/role badges, and opens an external link in a new window | preserve dialog accessibility and `_blank` link behavior |
| Add/edit | dialog emits the current fields; add supplies the selected lifecycle code; edit supplies the existing id | preserve payload fields, hydration, and close-on-success behavior |
| Copy/deactivate | copy removes identity/timestamps and targets the counterpart code; deactivate updates only `is_active=false` | preserve counterpart mapping, soft-delete semantics, confirmation, and invalidation |
| Query/mutation error | query errors currently produce no dedicated error panel; mutation errors use the existing destructive toast messages | preserve current error text/shape unless a separately approved UX change is added |
| Authorization | route is nested under `ProtectedRoute requireSuperAdmin`; hosted template SELECT policy is the broader `is_vivacity_staff` policy | keep route guard and server policy distinct; do not infer CSC access from the browser baseline |

## Generated-type and implementation checklist

- Generated `Row` shapes for `dd_lifecycle_type`,
  `dd_lifecycle_category`, and `dd_lifecycle_responsible_role` match the
  `LifecycleDropdownItem` fields exactly; the generated template row also
  matches `LifecycleTemplate` field-for-field.
- The current casts sit at a dynamic-table query boundary and at insert/update
  payload boundaries. This PR does not remove those casts; it only centralizes
  the proven UI-facing row aliases. Removing the query/payload casts remains a
  separate inference task.
- Keep React Query keys, invalidation, toast callbacks, and the three mutation
  contracts together unless a smaller measured seam is demonstrated.
- Do not move `LifecycleInstance`, onboarding queries, or
  `generate-staff-checklist`; they have separate contracts and owners.
- The implementation rebased onto `origin/main@81cef2ac0` after the RBAC
  decision packet named the capability vocabulary and enforcement boundary.
  Before/after measurements and the parity matrix are recorded above and in
  the implementation PR.

## Authorization and data-contract guardrails

- The route remains inside `requireSuperAdmin`.
- The hosted database currently distinguishes the UI boundary from the
  broader `is_vivacity_staff` template policy. P7-B must not silently make
  those boundaries equivalent.
- `lifecycle_type` is a text code without a foreign key to
  `dd_lifecycle_type`; a type adapter must not invent referential enforcement.
- The generated `lifecycle_checklist_templates` row/insert/update shapes are
  available, but current code casts query results at the hook boundary. Any
  cast removal requires a generated-schema check and focused regression tests.
- No admin template write should be exercised against production as part of
  this preparation packet.

## Implementation evidence

The implementation PR retains the P7-A characterization suite and adds no
runtime behavior. The existing 13 focused tests cover query-key/filter parity,
insert/update/soft-deactivate payload wiring, error-state characterization,
interactive display behavior, and route-guard preservation. It reports the
before/after LOC/import boundary, runs the full verification contract, and
uses no live write or authenticated browser pass because the change is
type-only and cannot alter emitted JavaScript.

## Current disposition

P7-B is complete for the minimal feature-boundary slice: generated type aliases
now live under `src/features/lifecycle/`, existing behavior remains covered by
the 13-test characterization suite, and no query adapter or runtime policy
change was justified. P7-C and P7-D remain sequential follow-ons; P7-D
additionally requires the separate disabled-user security hotfix.
