# secondary-contact-portal-access-fix (revised)

## Problem
Secondary contacts (`tenant_users.secondary_contact = true`, `access_scope = 'full'`) cannot see the Packages page (and other portal modules) at `/client/*`. RLS already permits them — `app.user_can_access_tenant()` only requires `access_scope='full'`. Bug is in the SPA gating layer; "View as Client" masks it because impersonation runs as the staff CSC.

DB confirms 1 secondary contact + 1 secondary‑role row currently exist with `access_scope='full'`.

## Investigation findings
- No nav/route guard keys off `primary_contact === true`. Existing `primary_contact` references are in invite dialogs / role mapper and are legitimate (leave alone).
- Today the Users sidebar item is gated by `adminOnly` → `getTenantRole(activeTenantId) === "Admin"`, which reads legacy `tenant_members`. In practice this surfaces it for primary contacts.
- `ClientTenantContext.activeTenantId` derives from `profile.tenant_id` (column on `users`). Secondary contacts whose tenancy lives only in `tenant_users` may have a null `users.tenant_id`, so `ClientRouteGuard` redirects them out.
- Invite-accept writes `access_scope='full'` for primary/secondary/user and `'academy_only'` for `academy_user`. 100% of existing secondary-contact rows are `'full'`. Proceed.

## Contract (single source of truth in tenant-user hook/context)
```ts
const canAccessClientPortal =
  tenantUser?.access_scope === 'full' &&
  (tenantUser.primary_contact === true || tenantUser.secondary_contact === true);

// Backup-admin model: BOTH primary and secondary manage users.
// Narrowing to secondary-only would regress today's primary-contact UX.
const canManagePortalUsers =
  tenantUser?.access_scope === 'full' &&
  (tenantUser.primary_contact === true || tenantUser.secondary_contact === true);

const isAcademyOnly =
  tenantUser?.access_scope === 'academy_only';
```
While loading, all three are `false` (no first-paint leakage).

## Changes

### 1. `src/contexts/ClientTenantContext.tsx`
Augment to also fetch the caller's `tenant_users` row for the active tenant and expose:
```
tenantUser, tenantUserLoading,
canAccessClientPortal, canManagePortalUsers, isAcademyOnly
```
Resilient `activeTenantId` resolution:
- If `profile.tenant_id` is set → use it (current behaviour).
- Else if the user has **exactly one** `tenant_users` row → use that row's `tenant_id`.
- Else (zero or 2+ rows with no `users.tenant_id`) → `activeTenantId` stays `null` and a `console.warn` is emitted. Multi-tenant users are a real future case; don't paper over with a silent pick.

### 2. Replace gating reads
| Surface | New gate |
|---|---|
| Sidebar items: Inbox, Home, Tasks, Packages, Documents, Files, Resource Hub, Calendar, Reports, Suggestions, TGA Details | `canAccessClientPortal` |
| Sidebar Vivacity Academy section | unchanged (still `academyAccessEnabled`) |
| Sidebar Users item (currently `adminOnly`) | `canManagePortalUsers` |
| `ClientRouteGuard` for `{packages, documents, files, tasks, calendar, reports, tga, suggestions}` | when `!tenantUserLoading && !canAccessClientPortal` → redirect; if `isAcademyOnly`, render `AcademyOnlyFallback` |
| `ClientRouteGuard` for `/client/users` | redirect when `!canManagePortalUsers` |
| Academy-only users | only `/client/academy/*` and `/client/help` render; everything else falls through to `AcademyOnlyFallback` ("ask your primary contact for access") |

Add small `AcademyOnlyFallback` component in `src/components/client/`.

### 3. Tests — `src/contexts/__tests__/ClientTenantContext.test.tsx`
1. Primary contact, `access_scope='full'` → `canAccessClientPortal=true, canManagePortalUsers=true, isAcademyOnly=false`
2. Secondary contact, `access_scope='full'` → `canAccessClientPortal=true, canManagePortalUsers=true, isAcademyOnly=false`
3. `access_scope='academy_only'` → `canAccessClientPortal=false, canManagePortalUsers=false, isAcademyOnly=true`
4. Loading (`tenantUser=null`) → all three `false`
5. **Resilient resolution (single row):** `profile.tenant_id=null`, exactly one `tenant_users` row (secondary contact, full) → `activeTenantId` resolves to that row's tenant_id; `canAccessClientPortal=true`
6. **Multi-row defensiveness:** `profile.tenant_id=null`, two `tenant_users` rows → `activeTenantId` stays `null`, a `console.warn` is emitted, all three booleans remain `false`

### 4. RLS smoke-test migration
File: `supabase/migrations/<timestamp>_rls_smoke_secondary_contact_can_access_tenant.sql` — exact SQL from brief §5.2. Self-cleaning DO block; raises if RLS contract narrows.

## Out of scope (per brief §8)
- "View as Client" impersonation drift
- `auth_rls_initplan` warnings
- Overlapping permissive SELECT policies on EOS tables
- Changes to `accept_invitation_v2` / `invite-user` edge function
- Renaming `primary_contact` / `secondary_contact`
- Any modification to `app.user_can_access_tenant` or other RLS helpers
- Any data mutation

## Definition of done
Mirrors brief §6.
