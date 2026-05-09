# Mount ClientTenantProvider in AcademyLayout

## Phase 1 — Provider stack check (findings)

**ClientTenantProvider dependencies** (`src/contexts/ClientTenantContext.tsx`, lines 1–4):
```
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { supabase } from "@/integrations/supabase/client";
```
It consumes exactly two React contexts: `AuthProvider` (via `useAuth`) and `ClientPreviewProvider` (via `useClientPreview`). `supabase` is a module singleton, not a context.

**Ancestor mounts** (`src/App.tsx`):
```
252:        <AuthProvider>
255:            <ClientPreviewProvider>
...
1135:            </ClientPreviewProvider>
1138:        </AuthProvider>
```
Both wrap the entire route tree, well above any `/academy/*` route. Mounting `ClientTenantProvider` inside `AcademyLayout` will see them in scope. No hoist required.

**AcademyLayout ancestry**: `App.tsx` route tree → Academy wrappers (e.g. `AcademyTrainerWrapper`) → `AcademyLayout` → children. All wrappers are descendants of `AuthProvider` + `ClientPreviewProvider`. Safe.

## Phase 2 — Mount the provider

Status: **already applied** in the previous turn (`src/components/layout/AcademyLayout.tsx`):

- Line 29: `import { ClientTenantProvider } from "@/contexts/ClientTenantContext";`
- Lines 143–145: `ClientTenantProvider` is the outermost wrapper inside the return, above `HelpCenterProvider` and the root `<div>`. Unconditional — present on every render path. Includes `ImpersonationBanner`, sidebar, top bar, and main content within scope.

No further code changes required for the structural fix. Single file touched.

## Phase 3 — Verification matrix (manual, post-deploy)

| # | Scenario | Expected |
|---|---|---|
| 3.1 | Real user, `academy_access_enabled=true`, navigate `/academy` | Brief spinner → dashboard |
| 3.2 | SuperAdmin impersonating Vivacity Coaching (6372) as `dave@zuut.com.au`, `/academy` | Brief spinner → dashboard |
| 3.3 | Tenant with `academy_access_enabled=false` (real user or impersonation) | Spinner → "not yet active" panel |
| 3.4 | Hard-refresh on `/academy` | Spinner first, no flash of "not yet active" |

Loading-vs-not-active footnote: the gate's initial render keys off `academyAccessLoading`, which defaults to `true` in the context (line 35 of `ClientTenantContext.tsx`) and is only flipped to `false` after either (a) `tenants` fetch settles or (b) `resolutionAttempted && activeTenantId == null`. Therefore scenario 3.4 should show the spinner first, never a flash of "not yet active". If a flash appears, the loading guard is broken and we revisit.

## Constraints honoured

- Single file changed: `AcademyLayout.tsx` (one import + outermost wrapper).
- No backend, no migrations, no new dependencies.
- `ClientTenantProvider`, `useClientTenant`, `AcademyAccessGate` untouched.
