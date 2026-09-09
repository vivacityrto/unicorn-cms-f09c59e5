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
