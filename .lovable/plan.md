## Bug

In preview mode, `useClientActingUser` ignores `ClientPreviewContext.actingUserId` (filtered via `list_acting_user_options` to real activated `auth.users`) and resolves a "parent" by querying `tenant_users` (relationship_role='primary_contact') then falling back to `tenant_members` (oldest active Admin → any active member). This selects ghost users (e.g. Peter Movsesian on tenant 5) with no `auth.users` row. Compounding it, `useAcademyActingUserId` and several consumer surfaces silently fall back to the authed staff user / `profile`, so academy reads/writes can run as the SuperAdmin and UI displays staff identity inside a tenant preview.

## Fix (frontend only — no DB, no RLS, no migration)

### 1. `src/hooks/useClientActingUser.ts` — rewrite preview branch

- Consume `useClientPreview()`: `actingUserId`, `actingUserOptions`. Keep `useClientTenant().isPreview` as the preview signal.
- Preview mode:
  - `actingUserId` null → `actingUser=null`, `isParentResolved=false`, `error="No activated users available for this tenant yet."`, `isLoading=false`. Do NOT touch tenant_users/tenant_members.
  - `actingUserId` set but not in `actingUserOptions` → same empty state, `error="Selected preview user is no longer available."` (defensive; restore-path also clears it).
  - Otherwise fetch profile from `public.users` by `user_uuid = actingUserId` only. If row missing, surface error — never fallback.
- Delete `resolveParentUser` (the tenant_users → tenant_members ladder) entirely — that's the ghost-user source.
- Non-preview branch: unchanged (uses `profile` from `useAuth`).
- Add `actingUserId` and `actingUserOptions` to effect deps.

### 2. `src/hooks/academy/useAcademyActingUserId.ts` — no staff fallback in preview

- When `isPreviewMode` is true: return `userId = actingUserId` (which may be `null`). **Never** fall back to `user?.id`.
- When not in preview: unchanged — return `user?.id`.
- This prevents academy reads/writes from running as the SuperAdmin when a tenant has no valid activated acting user.

### 3. `src/contexts/ClientPreviewContext.tsx` — harden restore path

In the restore `useEffect` (lines 85–106), after parsing stored session:
- If `s.actingUserId` is not present in `s.actingUserOptions`, set `actingUserId` to `null` silently and rewrite sessionStorage with the cleared value. No toast.
- All other restore behavior unchanged. `startPreview`, audit logging, RPC unchanged.

### 4. Consumer guards — neutral display when preview has no valid acting user

Audit and minimally guard each surface that currently does `actingUser?.x || profile?.x` (or similar) so that in preview mode + no valid acting user, it renders neutral/empty text instead of the staff member's name/email/avatar:

- `src/components/client/ClientHomePage.tsx`
- `src/pages/client/AcademyDashboardPage.tsx`
- `src/pages/client/AcademyLessonViewerPage.tsx`
- `src/pages/client/ClientProfilePage.tsx`
- `src/components/client/ClientTopbar.tsx`
- `src/components/client/ImpersonationBanner.tsx`
- `src/components/client/ViewAsClientButton.tsx`

Pattern (apply per file as appropriate):
```tsx
const { isPreviewMode } = useClientPreview();
const { actingUser, error } = useClientActingUser();
const displayName = actingUser
  ? `${actingUser.first_name} ${actingUser.last_name}`
  : isPreviewMode
    ? "—"                                  // or short empty-state label
    : `${profile?.first_name} ${profile?.last_name}`;
```
- Avatars: render initials placeholder, not staff avatar.
- Greeting/headline copy: show "Preview — no activated user available" where it materially affects the surface (home page hero, academy dashboard hero).
- No layout/UX redesign — minimal substitution only.

### 5. No DB / RLS / migration changes

- `list_acting_user_options` RPC unchanged.
- `tenant_users`, `tenant_members`, `auth.users` untouched.
- Tenant counts, dashboard stats, active/suspended counts unaffected.

## Verification

1. **Tenant 5 (Vital Resus), no activated users**: Start preview → topbar/banner/home/profile/academy show neutral empty state, never Peter/Karen, never the staff user. `useAcademyActingUserId().userId === null` so academy queries don't fire as SuperAdmin.
2. **Tenant with valid activated contact**: All surfaces show the same acting user; `useAcademyActingUserId().userId === actingUserId`.
3. **Stored session w/ stale acting user**: Reload → silently cleared, empty state shown.
4. **Non-preview real client login**: Profile/topbar/academy still use authenticated user (unchanged).
5. **Switch acting user via picker**: All surfaces update consistently.
6. **Dashboard counts** (clients, active, suspended): unchanged — no shared code touched.

## Risk Assessment

- **Low risk**: isolated to two hooks + a defensive restore guard + minimal consumer guards. No DB writes, no policy changes.
- **Backward compatible**: non-preview path identical; preview path refuses ghost users and refuses staff fallback.
- **Audit trail preserved**: `audit_client_impersonation` insert in `startPreview` unchanged.
- **Intended regressions**: surfaces that previously displayed the ghost or the staff member during preview will now show neutral empty state. Academy queries that previously executed as the SuperAdmin during preview will now no-op. Both are corrections, not regressions.

## Files touched

- `src/hooks/useClientActingUser.ts`
- `src/hooks/academy/useAcademyActingUserId.ts`
- `src/contexts/ClientPreviewContext.tsx`
- Consumer guards in: `ClientHomePage.tsx`, `AcademyDashboardPage.tsx`, `AcademyLessonViewerPage.tsx`, `ClientProfilePage.tsx`, `ClientTopbar.tsx`, `ImpersonationBanner.tsx`, `ViewAsClientButton.tsx` (only where `actingUser?.x || profile?.x` patterns exist).
