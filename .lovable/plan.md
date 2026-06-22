## Problem
Integrator role users are redirected to /dashboard when navigating to the People page (`/admin/staff-engagements`) because `ProtectedRoute` relies on `canAccessRoute`, which classifies all `/admin/` paths as admin routes requiring `administration:access` — a permission Integrators do not have.

## Solution
Two targeted changes in `src/hooks/useRBAC.tsx`:

1. **Add permission type and grant it to Integrator**
   - Extend the `Permission` union type with `'staff_engagements:access'`.
   - Add `'staff_engagements:access'` to the `Integrator` role's permission array in `ROLE_PERMISSIONS`.

2. **Add route-specific access rule in `canAccessRoute()`**
   - Insert a check before the generic `ADMIN_ROUTES` block:
     ```typescript
     if (path.startsWith('/admin/staff-engagements')) {
       return hasPermission('administration:access') || hasPermission('staff_engagements:access');
     }
     ```
   - This allows Integrators (and SuperAdmins) to reach `/admin/staff-engagements` without weakening access to any other `/admin/` route.

## Scope & Safety
- **Only file changed:** `src/hooks/useRBAC.tsx`
- **Not changed:** `ProtectedRoute.tsx`, `StaffEngagements.tsx`, `StaffEngagementDetail.tsx`, `DashboardLayout.tsx`, any other role mappings, routes, or backend policies.
- **Preserved:** SuperAdmin access to the People page. All other `/admin/` routes remain inaccessible to Integrators.