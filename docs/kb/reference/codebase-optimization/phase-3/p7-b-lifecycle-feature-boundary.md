# P7-B Lifecycle Feature-Boundary Preparation

> **Status:** preparation-only; no runtime, authorization, schema, RLS, or
> production-data change
>
> **Parent packet:** Phase 2.6 P7-B — minimal feature boundary
>
> **Prerequisite:** P7-A characterization merged in PR #1049

## Purpose and non-goals

This packet records the smallest boundary that could follow the lifecycle
checklist characterization. It is not an implementation authorization. The
existing `requireSuperAdmin` route guard, current database enforcement, and
all lifecycle instance workflows remain unchanged until the RBAC vocabulary
and staff-scope decisions are approved.

Out of scope are a generic feature framework, a new permission registry,
tenant lifecycle transitions, checklist-instance mutation, schema/RLS/grant
changes, Edge deployment, and changes to the staff onboarding workflow.

## Current consumer and contract map

| Surface | Current source | Boundary finding |
| --- | --- | --- |
| Admin route | `src/routes/dashboardRoutes.tsx` → `LifecycleChecklistsAdmin` | One lazy route, inside the shared `ProtectedRoute requireSuperAdmin` group; route policy must remain authoritative. |
| Admin orchestration | `src/pages/admin/LifecycleChecklistsAdmin.tsx` | Owns active tab, category grouping, counterpart mapping, dialog state, and mutation callbacks. Keep these page concerns local. |
| Query/mutation hook | `src/hooks/useLifecycleChecklists.ts` | Owns dropdown reads, template list read, three template mutations, React Query keys/invalidation, and toasts. This is the candidate seam, but splitting every concern would add boilerplate. |
| Display grid | `src/components/admin/lifecycle/LifecycleTemplateGrid.tsx` | Pure display/action callbacks; imports only `LifecycleTemplate` as a type from the hook. No data fetching or authorization. |
| Edit/add dialog | `src/components/admin/lifecycle/LifecycleTemplateDialog.tsx` | Pure form state and payload construction; imports `LifecycleTemplate` and `LifecycleDropdownItem` as types from the hook. No data fetching or authorization. |
| Staff onboarding hub | `src/hooks/useOnboardingHub.ts` | Separate query and instance mutation contract. It does not import the admin hook or admin types. Do not fold it into this boundary. |
| Staff self-onboarding | `src/pages/MyOnboardingPage.tsx` | Separate direct reads and note mutation over checklist instances. Do not fold it into this boundary. |
| Checklist generation | `supabase/functions/generate-staff-checklist/index.ts` | Server-side template read and instance insert; independent Edge contract and authorization. Do not change it in P7-B. |

The hook has three production importers in `src/` (the page and two type-only
component imports). `LifecycleInstance` is exported by the hook but has no
production importer; it should not be moved or expanded without a consumer.
The focused P7-A test is an additional type/import consumer and remains the
behavioral characterization oracle.

## Smallest safe candidate

If the RBAC gate is approved, the first implementation should be limited to:

1. Move the two UI-facing value shapes (`LifecycleTemplate` and
   `LifecycleDropdownItem`) into a feature-local type module, or replace them
   with explicit aliases only if generated types prove the shapes are stable.
2. Introduce a narrow feature query/mutation adapter only for the admin
   template surface if it removes direct Supabase knowledge from the page and
   makes the existing tests materially easier to control.
3. Leave React Query lifecycle, toast behavior, query keys, and mutation
   invalidation in one place. Do not split these into generic repositories.
4. Keep `LifecycleTemplateGrid` and `LifecycleTemplateDialog` callback-driven;
   they are already the display-only core for this feature. No genuinely
   shared display core with onboarding or other modules was found.

The adapter must preserve the current query contract: three active dropdown
lists ordered by `sort_order`; template reads ordered by `category` then
`sort_order` and filtered by the selected text lifecycle code; create/update
return the inserted row; deactivate is a soft update of `is_active = false`;
successful mutations invalidate `lifecycle-templates`; and error toasts retain
the current messages.

## Implementation-readiness snapshot

Measured from `origin/main@64c37ba97` on 2026-09-09. This is a baseline for a
future implementation PR, not an acceptance target or a claim that extraction
is approved.

| Surface | Physical lines | Production import evidence |
| --- | ---: | --- |
| `src/hooks/useLifecycleChecklists.ts` | 175 | imported by the admin page; its two UI-facing types are imported type-only by the grid and dialog |
| `src/pages/admin/LifecycleChecklistsAdmin.tsx` | 204 | lazy-loaded by the lifecycle route |
| `src/components/admin/lifecycle/LifecycleTemplateGrid.tsx` | 139 | callback-driven display/actions only |
| `src/components/admin/lifecycle/LifecycleTemplateDialog.tsx` | 176 | callback-driven form/payload construction only |
| `src/test/admin/lifecycle-checklists.test.tsx` | 322 | 13 characterization tests; not production reachability |

The repository-wide architecture script reports 1,710 tracked product files,
480,182 physical lines, 407,144 lines excluding generated types, and 394,259
lines excluding generated types and tests. The lifecycle hook contributes no
directly measurable shared abstraction: the only production dependency edge is
the admin page's runtime import plus two type-only component edges. The
`LifecycleInstance` export still has zero production consumers.

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
  payload boundaries. Removing them is not automatically safe: first prove the
  dynamic-table generic inference and embedded query shape with `typecheck` and
  focused tests.
- Keep React Query keys, invalidation, toast callbacks, and the three mutation
  contracts together unless a smaller measured seam is demonstrated.
- Do not move `LifecycleInstance`, onboarding queries, or
  `generate-staff-checklist`; they have separate contracts and owners.
- Before implementation, rebase from the latest `origin/main`, confirm the RBAC
  decision packet has named the capability vocabulary and enforcement boundary,
  then record before/after LOC/import counts and rerun this parity matrix.

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

## Required implementation evidence after approval

The implementation PR should retain the P7-A characterization suite and add
only tests for the new seam: query-key/filter parity, insert/update/soft-
deactivate payload parity, error propagation/toast parity, and route guard
preservation. It must report before/after LOC and import counts, run the full
verification contract, and use read-only authenticated browser coverage for
the route. No P7-B implementation should start until the RBAC decision packet
names the capability vocabulary and confirms the server-enforcement boundary.

## Current disposition

P7-B is technically small enough to prepare, but implementation is gated. The
current recommendation is to land this packet as evidence only, wait for the
RBAC/Tenant decision packet, then make one minimal feature-boundary PR if the
measured extraction is smaller or materially easier to test. P7-C and P7-D
remain sequential follow-ons; P7-D additionally requires the separate
disabled-user security hotfix.
