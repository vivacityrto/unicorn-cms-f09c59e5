## Fix Angela's `/admin/bulk-invite` redirect (Option A: both guards)

Two minimal edits. No other files touched.

### Edit 1 — `src/pages/admin/BulkInvite.tsx`

Add `Navigate` to the existing import (line 2):

```tsx
import { Navigate, useNavigate } from "react-router-dom";
```

Replace the `useEffect` access-control block (lines 78–85) with a render-time guard:

**Before:**
```tsx
// Access control
useEffect(() => {
  if (authLoading) return;
  if (!isSuperAdmin) {
    toast({ title: "Access denied", description: "Only SuperAdmins can use the bulk invite tool.", variant: "destructive" });
    navigate("/dashboard");
  }
}, [authLoading, isSuperAdmin, navigate, toast]);
```

**After:**
```tsx
// Access control — wait for the profile to resolve, then check ONLY unicorn_role.
// Do NOT add is_team / tenant_id / user_type checks; unicorn_role is authoritative.
if (authLoading || profile === null || profile === undefined) {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );
}
if (profile.unicorn_role !== "Super Admin") {
  return <Navigate to="/dashboard" replace />;
}
```

### Edit 2 — `src/components/ProtectedRoute.tsx`

Add `profile` to the `useAuth()` destructure (line 14):

```tsx
const { user, profile, loading } = useAuth();
```

Replace the SuperAdmin check (lines 34–37):

**Before:**
```tsx
// Check if route requires SuperAdmin access
if (requireSuperAdmin && !isSuperAdmin) {
  return <Navigate to="/dashboard" replace />;
}
```

**After:**
```tsx
// Check if route requires SuperAdmin access.
// useAuth sets loading=false as soon as the session resolves, but profile is
// fetched asynchronously after that. Wait for profile before judging, otherwise
// legitimate SuperAdmins get redirected on first paint.
if (requireSuperAdmin && !profile) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary-dark to-secondary">
      <div className="text-white text-xl">Loading...</div>
    </div>
  );
}
if (requireSuperAdmin && !isSuperAdmin) {
  return <Navigate to="/dashboard" replace />;
}
```

### Not changing

- `useAuth.tsx` — deferred profile fetch is intentional (avoids deadlock).
- `useRBAC.ts` — its `isSuperAdmin` already correctly checks `unicorn_role === 'Super Admin'`.
- `App.tsx` — route registration at line 1014 is correct as-is.
- `ManageInvites.tsx` — Revoke gate is render-time conditional, tolerates null-profile naturally.
- `send-invitation-email` v501 — untouched, CAPS comment block intact.

### Verification

1. Angela hard-refreshes `/admin/bulk-invite` → brief spinner → page renders, no redirect.
2. Non-SuperAdmin → still redirected to `/dashboard` after profile resolves.
3. ManageInvites Revoke button still SuperAdmin-only.

Approve and I'll apply both edits.