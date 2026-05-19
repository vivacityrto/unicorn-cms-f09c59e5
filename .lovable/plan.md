## Problem

Clicking **Clients → Documents** (or any non-client route) sometimes bounces Vivacity staff back to `/dashboard`. This happens on fresh route mounts where `useAuth`'s `loading` has flipped to `false` but `profile` is still being fetched (the profile fetch runs in a `setTimeout` after session resolves — `src/hooks/useAuth.tsx:60-64, 77-81`).

In that window, `ProtectedRoute` (`src/components/ProtectedRoute.tsx:54`) evaluates:

```
if (!isClientRoute && !isVivacityTeam) return <Navigate to="/dashboard" replace />;
```

With `profile === null`, `isVivacityTeam` is `false`, so `/manage-documents` (not in `CLIENT_ROUTES`) gets redirected. The same race was already guarded for `requireSuperAdmin` at lines 36–42 by waiting for `profile` — that guard just wasn't generalised.

## Fix

In `src/components/ProtectedRoute.tsx`, before the route-classification block (currently lines 47–61), add a "profile still loading" gate that returns the existing loading screen whenever we have a user but no profile yet. This holds rendering until `profile` resolves, after which `isVivacityTeam` reflects the real role and no false redirect fires.

Concretely:

1. After the `if (!user)` block (line 30) and before line 47, add:

   ```tsx
   // Wait for profile before role-gating. useAuth flips `loading` to false
   // as soon as the session resolves, but profile is fetched asynchronously
   // (setTimeout in onAuthStateChange / getSession). Without this gate,
   // Vivacity staff get a transient isVivacityTeam=false and are redirected
   // to /dashboard from non-client routes like /manage-documents.
   if (!profile) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary-dark to-secondary">
         <div className="text-white text-xl">Loading...</div>
       </div>
     );
   }
   ```

2. Remove the now-redundant `requireSuperAdmin && !profile` block at lines 36–42 (the new general guard covers it).

No other files change. `CLIENT_ROUTES`, `ADMIN_ROUTES`, RBAC logic, and the route table in `App.tsx` are untouched.

## Why this is safe

- For users with a valid session and profile, behaviour is unchanged (the new gate is a no-op).
- For unauthenticated users, the earlier `if (!user)` redirect to `/login` still fires first.
- For users whose profile row is genuinely missing, `fetchUserProfile` logs `No user profile found` and `profile` stays `null` — they'll see the loading screen instead of being silently bounced to `/dashboard`, which is the correct surfacing (and matches the pre-existing SuperAdmin guard).
- The gate adds at most a few hundred ms of "Loading…" on first paint after a hard reload; subsequent navigations reuse the cached `profile` in `AuthContext` and render instantly.

## Verification

- As Dave Richards (Vivacity staff), click **Clients → Documents** repeatedly, including immediately after a hot-reload (`?__lovable_sha=…`). The page stays on `/manage-documents` every time.
- Other non-client routes (`/manage-tenants`, `/resource-hub`, `/admin/code-tables`) no longer bounce to `/dashboard` on first mount.
- Client-role users (unicorn_role `Admin`/`User`) hitting `/manage-documents` still get redirected to `/dashboard` once the profile resolves (existing deny-by-default behaviour).
- TS build clean, no console errors.
