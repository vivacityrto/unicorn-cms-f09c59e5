## Goal
Let Vivacity internal staff (Super Admin et al.) use the client Ask Viv panel while in client preview mode, without weakening the gate for real client users.

## Changes (4 files, code-only, no migrations)

### 1. `supabase/functions/_shared/ask-viv-access.ts`
- Add optional `previewTenantId?: number` parameter to `validateClientAskVivAccess`.
- Before the role gate, short-circuit with `{ allowed: true, tenant_id: previewTenantId }` when `previewTenantId != null` AND `isVivacityInternal(profile)` is true.
- If `previewTenantId` is provided but the user is not internal staff, ignore it and fall through to the standard client-role/membership checks.

### 2. `supabase/functions/compliance-assistant-client/index.ts`
- Import `isVivacityInternal` from the shared module.
- Parse `preview_tenant_id` from the request body when it is a number.
- Update the forbidden-field guard: keep blocking `tenant_id`, `client_id`, `package_id`, `phase_id` unconditionally; block `preview_tenant_id` only for non-staff callers.
- Pass `previewTenantId` as the new 5th arg to `validateClientAskVivAccess`.

### 3. `src/components/ask-viv/ClientAskVivPanel.tsx`
- Add optional `previewTenantId?: number` to `ClientAskVivPanelProps`.
- In `handleSend`, spread `{ preview_tenant_id: previewTenantId }` into the JSON body only when set.

### 4. `src/components/layout/ClientLayout.tsx`
- Destructure `activeTenantId` alongside `isPreview` from `useClientTenant()`.
- Pass `previewTenantId={isPreview ? activeTenantId ?? undefined : undefined}` to `<ClientAskVivPanel>`.

## Out of scope
No other components, hooks, tests, docs, or migrations.
