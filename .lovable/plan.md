# Fix: Academy-only users land on /academy

## Problem
`src/pages/PostSignInRedirect.tsx` checks `hasFullAccess` before `hasAcademyOnly`. Users with both flags (or any with `hasFullAccess` true) get sent to `/client/home` instead of `/academy`.

## Change (single file)
`src/pages/PostSignInRedirect.tsx` only.

Add a derived boolean and reorder the routing branches inside the existing `useEffect`:

```ts
const shouldLandInAcademy = flags.hasAcademyOnly && !flags.hasFullAccess;

if (flags.isVivacityStaff) { navigate("/dashboard", { replace: true }); return; }
if (shouldLandInAcademy)    { navigate("/academy",   { replace: true }); return; }
if (flags.hasFullAccess)    { navigate("/client/home", { replace: true }); return; }
if (flags.hasAcademyOnly)   { navigate("/academy",   { replace: true }); return; }
// no-tenant fallback (keep existing fresh-toast behavior)
if (fresh) toast.warning("Academy access only — contact support if you expected more.");
navigate("/academy", { replace: true });
```

Keep:
- 5s timeout fallback to `/academy`
- `fresh` toast logic for no-tenant case
- Effect dependency array
- All other code untouched

## Out of scope
- `useUserAccess`, `ClientTenantContext`, `ClientRouteGuard`
- RLS, migrations, schema, tenant data

## Verification
- Academy-only user → `/academy`
- Full-access primary/secondary contact → `/client/home`
- Vivacity staff → `/dashboard`
- Magic link + Microsoft login → same routing (all flow through `/post-sign-in`)
- Direct visit to `/client/home` as academy-only → still hits existing `ClientRouteGuard` fallback
