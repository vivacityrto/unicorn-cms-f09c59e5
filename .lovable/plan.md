## Goal
Stop academy-only invitees from landing on `/dashboard` (which hangs on a permanent spinner). Delegate landing-page choice to the existing role-aware `PostSignInRedirect` and add a defensive academy-user guard in `ProtectedRoute` so stale links or manual URL entry can't re-trigger the hang.

## Scope
Routing/redirect fix only. Two files. No schema, RPC, hook, or route-config changes.

## Changes

### 1. `src/pages/AcceptInvitation.tsx` — replace all three hardcoded `/dashboard` redirects

- **Line 212** — `signUp` options:
  - Before: `emailRedirectTo: \`${window.location.origin}/dashboard\``
  - After:  `emailRedirectTo: \`${window.location.origin}/post-sign-in?fresh=1\``
- **Line 252** — existing-user (already-registered) path:
  - Before: `setTimeout(() => navigate('/dashboard'), 1500);`
  - After:  `setTimeout(() => navigate('/post-sign-in', { state: { fresh: true }, replace: true }), 1500);`
- **Line 299** — new-user success path:
  - Before: `setTimeout(() => navigate('/dashboard'), 1500);`
  - After:  `setTimeout(() => navigate('/post-sign-in', { state: { fresh: true }, replace: true }), 1500);`

Leave the line 231 `navigate('/')` (login redirect on password mismatch) untouched — it's not a `/dashboard` redirect. Leave the toast copy at line 250 ("Redirecting to dashboard…") and line 296 ("Redirecting…") alone; users will land on the right place regardless of the toast text. (Optionally tidy line 250 to "Redirecting…" for honesty — flagged as optional, no functional impact.)

### 2. `src/components/ProtectedRoute.tsx` — add academy-only guard

Add new imports at the top:
```ts
import { ACADEMY_ONLY_ROUTES } from '@/config/navigationConfig';
import { useUserAccess } from '@/hooks/useUserAccess';
```

Call `useUserAccess()` alongside the existing `useAuth` / `useRBAC` hooks (unconditional — hooks rules).

Insert the new check **after** the `if (!profile) { ... loading ... }` gate and **before** the `requireSuperAdmin` check (so it short-circuits the deny-by-default `/dashboard` branch). Skip the redirect while `useUserAccess` is still loading to avoid a flash redirect before flags resolve:

```tsx
const { hasAcademyOnly, hasFullAccess, isVivacityStaff, isLoading: accessLoading } = useUserAccess();

if (!accessLoading && hasAcademyOnly && !hasFullAccess && !isVivacityStaff) {
  const isAcademyRoute = ACADEMY_ONLY_ROUTES.some(r => location.pathname.startsWith(r));
  if (!isAcademyRoute) {
    return <Navigate to="/academy" replace />;
  }
}
```

Target is `/academy` — never `/dashboard` (that's the hang).

## What does NOT change
- `useUserAccess`, `PostSignInRedirect.tsx`, `accept_invitation_v2` RPC, `App.tsx` routes, navigation menu config, any schema/view/trigger.

## Verification
1. `rg "/dashboard" src/pages/AcceptInvitation.tsx` → zero matches.
2. Re-read `ProtectedRoute.tsx` and confirm the new branch targets `/academy`, not `/dashboard`.
3. TypeScript builds clean (harness runs it automatically).
4. Sanity-trace `PostSignInRedirect` routing for each role:
   - Vivacity staff → `/dashboard` ✓
   - Full-access client (primary_contact / secondary_contact / user) → `/client/home` ✓
   - Academy-only → `/academy` ✓
   - No tenant rows → `/academy` + warning toast (because `fresh: true`) ✓

## Risks
- `useUserAccess` adds one tenant_users probe for every protected route render for non-staff. Already cached 5min via React Query and short-circuits for staff — negligible cost. Loading state is gated so no flash redirect.
- If a full-access user also has an academy_only row, the existing `PostSignInRedirect` logic (`hasAcademyOnly && !hasFullAccess`) correctly leaves them as full-access — our guard mirrors that exact condition, so no regression.
