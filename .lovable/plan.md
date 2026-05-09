# Academy Gate Infinite Spinner — Root Cause + Fix

## Diagnosis (two compounding bugs)

### Bug A — `ClientTenantProvider` is not mounted on `/academy/*`
Confirmed via `rg "ClientTenantProvider"`: the only mount is in `src/components/layout/ClientLayout.tsx` (line 173). `src/components/layout/AcademyLayout.tsx` does NOT wrap children in `ClientTenantProvider`. Every Academy wrapper renders `<AcademyLayout><AcademyAccessGate>…</AcademyAccessGate></AcademyLayout>`, so `useClientTenant()` inside the gate falls through to the default context value:

```ts
academyAccessEnabled: false,
academyAccessLoading: true,
```

After the previous patch added the spinner branch (`if (academyAccessLoading) return <Loader2/>`), every Academy page on every tenant now hangs on that spinner forever — no provider exists to ever flip the flag. This is why Trainer Hub and Governance Person, which previously worked, now also spin: it's not impersonation-specific, it's universal across `/academy/*`.

### Bug B — `academyAccessLoading` wiring is fragile even with the provider mounted
The current second effect in `ClientTenantContext.tsx` (lines 103–125) only flips `academyAccessLoading` to `false` in two places:
1. After the `tenants` fetch resolves (when `activeTenantId` is truthy).
2. In the `!activeTenantId` branch, only when `profile?.user_uuid && resolvedTenantId === null && !isPreview`.

Failure modes that leave the flag stuck on `true`:
- **Impersonation pivot**: switching between impersonated tenants — `previewTenant` flips before `profile.user_uuid` re-evaluates, and intermediate states can reach the early-return without setting `false`.
- **No profile yet** but `activeTenantId === null`: the `else` doesn't fire (because `profile.user_uuid` is missing) → stays `true` indefinitely.
- **`resolvedTenantId` resolution failure** (multi-tenant_users with no `users.tenant_id`): `setResolvedTenantId(null)` runs but the second effect's terminal condition can race with `isPreview`.

The user's framing is correct: the loading flag should track only the second async (`tenants` fetch), not the entire `activeTenantId` resolution chain.

## Fix

### Step 1 — Mount `ClientTenantProvider` in `AcademyLayout`
File: `src/components/layout/AcademyLayout.tsx`

Wrap the existing `HelpCenterProvider` subtree in `ClientTenantProvider`:

```tsx
return (
  <ClientTenantProvider>
    <HelpCenterProvider>
      {/* existing layout */}
    </HelpCenterProvider>
  </ClientTenantProvider>
);
```

Add the import:
```ts
import { ClientTenantProvider } from "@/contexts/ClientTenantContext";
```

This restores entitlement resolution for every Academy route in one place. No wrapper changes needed (per user constraint).

### Step 2 — Refactor `academyAccessLoading` in `ClientTenantContext.tsx`
File: `src/contexts/ClientTenantContext.tsx`

Make the flag track **only** the `tenants.academy_access_enabled` fetch lifecycle, decoupled from how `activeTenantId` was resolved. Concretely:

- Default `academyAccessLoading: true` (unchanged).
- In the second effect (the one that fetches `tenants`):
  - If `activeTenantId` is set (by any path — impersonation, `users.tenant_id`, or `tenant_users` lookup): `setAcademyAccessLoading(true)` → fire fetch → `setAcademyAccessLoading(false)` in `finally` (success **or** error). Use a `try/finally` so an error in the supabase call still flips the flag.
  - If `activeTenantId` is `null` AND tenant resolution has settled (i.e. the first effect has run to completion — either `profile.user_uuid` is absent, or `resolvedTenantId` was explicitly set to `null` after the lookup): `setAcademyAccessLoading(false)` and `setAcademyAccessEnabled(false)`. The "settled" signal is `profile?.user_uuid !== undefined` AND we've passed at least one render where the resolution ran.

The cleanest implementation: track a `resolutionAttempted` boolean inside the first effect (set to `true` at the end of every branch, including the impersonation branch). The second effect then keys off `(activeTenantId, resolutionAttempted)`:
- `activeTenantId != null` → fetch + flip on settle.
- `activeTenantId == null && resolutionAttempted` → flip to `false`.
- otherwise (still resolving) → leave `true`.

### Step 3 — Watchdog on tenant resolution
File: `src/contexts/ClientTenantContext.tsx`

Add a 5-second watchdog effect. When `academyAccessLoading === true` and `activeTenantId === null`, start a `setTimeout(5000)` that:
- `console.warn("[ClientTenantContext] tenant resolution exceeded 5s — surfacing not-active state")`
- `setAcademyAccessLoading(false)`
- (leaves `academyAccessEnabled` as `false`, so the gate renders the "not active" panel rather than spinning forever)

Clear the timeout when `activeTenantId` becomes non-null, when the loading flag flips for any other reason, or on unmount.

### Step 4 — Verification matrix
Manual checks on the preview after deploy:

| Scenario | Expected |
|---|---|
| SuperAdmin impersonating AHMRC (fresh load on `/academy/trainer`) | Gate renders Trainer Hub (no spinner, no "not active") |
| SuperAdmin impersonating AHMRC (pivot from another tenant) | Same |
| SuperAdmin impersonating a tenant with `academy_access_enabled = false` | Gate renders "Academy not yet active" |
| Real client user (no impersonation) on a tenant with academy enabled | Gate renders the page |
| Network failure on `tenants` fetch | Gate renders "not active" within ~1s, console error logged |
| Tenant resolution stalls > 5s | Gate renders "not active", watchdog warning logged |

## Files changed
1. `src/components/layout/AcademyLayout.tsx` — add `ClientTenantProvider` wrap + import.
2. `src/contexts/ClientTenantContext.tsx` — refactor loading-flag wiring + add watchdog.

Wrappers (`AcademyTrainerWrapper.tsx`, `AcademyGovernancePersonWrapper.tsx`, etc.) — **untouched**, per constraint.

## Out of scope
- No RPC/migration (per prior constraints).
- No changes to `AcademyAccessGate.tsx` — its current shape (loading → spinner; !enabled → panel; else → children) is correct.
- No instrumentation beyond the single watchdog `console.warn` (which is a real recoverable-error signal, not debug noise).
