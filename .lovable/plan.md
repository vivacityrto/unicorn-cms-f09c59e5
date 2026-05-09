# Academy Pathway Entitlement Gate Fix

Fix the false-negative "Academy not yet active" message on Compliance Manager, Student Support Officer, and Administration Assistant pathways.

## Root cause (verified in code)

**Bug 1 — Wrappers are inconsistent.** Five pathway wrappers exist; only three wrap their page in `<AcademyAccessGate>`:

| Wrapper | Has `<AcademyAccessGate>`? | Behaviour observed |
|---|---|---|
| `AcademyTrainerWrapper` | No | Renders ✓ |
| `AcademyGovernancePersonWrapper` | No | Renders ✓ |
| `AcademyComplianceManagerWrapper` | **Yes** | Shows "not active" ✗ |
| `AcademyStudentSupportWrapper` | **Yes** | Shows "not active" ✗ |
| `AcademyAdminAssistantWrapper` | **Yes** | Shows "not active" ✗ |

That's why two work and three don't — nothing to do with slug maps, target_audience tagging, or feature flags.

**Bug 2 — `AcademyAccessGate` has no loading state.** `ClientTenantContext` (lines 41–124):

- `academyAccessEnabled` initial state = `false` (line 45)
- Updates only after two chained async effects complete: (a) resolve `activeTenantId` from `tenant_users` (lines 55–96), then (b) fetch `tenants.academy_access_enabled` (lines 102–124).
- The context exposes no `loading` flag for these fetches.

`AcademyAccessGate` reads `academyAccessEnabled` and falls straight to the "not active" branch when it's falsy (line 19). It cannot distinguish "still loading" from "confirmed disabled", so on first render — and for the whole async window — it shows the gate. In impersonation mode the chain runs longer, so the false-negative is visible/sticky.

This also means Trainer/Governance "work" only by accident — adding the gate to those wrappers would break them too, until Bug 2 is fixed.

## Fix

### File 1 — `src/contexts/ClientTenantContext.tsx`
- Add `academyAccessLoading: boolean` to the context type, default `true`.
- Track loading across both effects:
  - When `activeTenantId` is null AND tenant resolution hasn't settled (no profile yet, or `tenant_users` query pending) → loading `true`.
  - When `activeTenantId` resolves and the `tenants` fetch is in flight → loading `true`.
  - When `tenants` fetch settles (success or error) → loading `false`.
  - When `activeTenantId` settles to `null` (resolved, but user has no tenant) → loading `false`, `academyAccessEnabled` stays `false` (correct behaviour: not entitled).
- Expose via the provider value alongside `academyAccessEnabled`.
- Simplest implementation: a single `academyAccessLoading` state initialised `true`, set `false` in both terminal branches of the second effect and in the early-return when `activeTenantId === null` after profile is known.

### File 2 — `src/components/academy/AcademyAccessGate.tsx`
- Read `academyAccessLoading` alongside `academyAccessEnabled`.
- While loading: render a minimal skeleton (centered spinner or a 3-line `<Skeleton>` block — match the Suspense fallback the wrappers already use: `<Loader2 className="h-6 w-6 animate-spin text-primary" />` in a centered container).
- Only render the "Academy not yet active" panel when `!academyAccessLoading && !academyAccessEnabled`.
- When entitled: render `children` as today.

### Files 3–4 — Wrapper consistency
Add `<AcademyAccessGate>` to the two wrappers currently missing it, so all five pathways enforce entitlement uniformly:

- `src/pages/client/AcademyTrainerWrapper.tsx` — wrap `<TrainerHubPage />` in `<AcademyAccessGate>` (mirroring the structure of `AcademyComplianceManagerWrapper`).
- `src/pages/client/AcademyGovernancePersonWrapper.tsx` — same change for `<GovernancePersonPage />`.

Once Bug 2 is fixed, this is safe — the gate will no longer false-negative.

## What this does NOT change

- `AudienceHubPage.tsx` — untouched. The "no courses for this pathway" empty state stays as-is for now (separate ticket).
- `useAcademyCourses.ts`, the page components, route registration — untouched.
- No DB migration. `academy_access_enabled` derivation is correct; the issue is purely client-side loading/branch handling.
- `target_audience` filtering is unrelated to this bug — once the gate stops firing, the existing course-fetch logic will render the 13 / 5 / 7 tagged courses for AHMRC.

## Verification

1. Impersonate AHMRC (`academy_access_enabled = true`):
   - All five pathways render their hub (Trainer, Governance, Compliance Manager, Student Support, Admin Assistant). Compliance Manager shows 13 courses, SSO shows 5, Admin Assistant shows 7.
   - During load, a brief spinner appears (no flash of "not active").
2. Impersonate a tenant with `academy_access_enabled = false`:
   - All five pathways show "Academy not yet active" — uniformly, after the loading spinner.
3. Sign in as a real client user (no impersonation): same two scenarios behave identically.
4. Network throttle: confirm spinner persists during slow fetch and "not active" never flashes for an entitled tenant.
