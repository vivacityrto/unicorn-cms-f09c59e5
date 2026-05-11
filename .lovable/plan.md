## Fix: PostSignInRedirect sending staff to /academy

### Root cause
`useUserAccess` reports `isLoading: false` as soon as the auth session resolves and the `tenant_users` query is skipped (which happens for staff because `enabled` is false). But `profile` from `useAuth` — which carries the role used by `isSuperAdmin()` / `isVivacityTeam` — loads asynchronously after the session. So the router sees `isVivacityStaff = false`, `hasFullAccess = false`, `hasAcademyOnly = false` and falls through to the academy default, 404'ing staff.

### Change

**File:** `src/hooks/useUserAccess.ts` — single line change.

1. Pull `profile` out of the existing `useAuth()` destructure (already imported).
2. Update the returned `isLoading` to also wait for `profile` whenever a `userId` is present:

```ts
const { user, profile, isSuperAdmin, loading: authLoading } = useAuth();
...
isLoading: authLoading || (!!userId && profile === null) || (enabled && isLoading),
```

Nothing else in the file changes — `enabled`, `queryFn`, `staleTime`, and the `hasFullAccess` / `hasAcademyOnly` / `isVivacityStaff` / `hasAnyTenant` computations stay exactly as they are.

### Out of scope (explicitly not touching)
- `src/pages/PostSignInRedirect.tsx` — routing logic and 5s safety timeout untouched.
- `useAcademyActingUserId.ts`, `AcademyTopBar.tsx`, `ImpersonationBanner.tsx`.
- RLS, DB, or any other hook/context.

### Verification
- SuperAdmin / Team Member → `/dashboard`.
- Full-access portal contact → `/client/home`.
- Academy-only user → `/academy`.
- Spinner stays visible until profile resolves; 5s fallback unchanged.
