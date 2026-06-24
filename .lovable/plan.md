## Fix `useKpiAccess` reviewer source

Reviewer status now lives on `users.kpi_role = 'reviewer'` (already exposed via `useAuth().profile`). Replace the `user_roles` query with a synchronous profile check.

### Change — `src/hooks/useKpiAccess.tsx`

- Drop the `useEffect`, `useState`, `supabase`, and `user` usage.
- Compute `isReviewer` directly: `profile?.kpi_role === "reviewer"`.
- Drop `loading` (now synchronous) — return `loading: false` to keep the existing return shape and avoid touching callers.
- Update the doc comment to reference `users.kpi_role = 'reviewer'`.

Resulting hook:

```ts
import { useAuth } from "@/hooks/useAuth";

/**
 * Whether the current user can view any staff member's KPI dashboard.
 * True for SuperAdmins and profiles where `users.kpi_role = 'reviewer'`.
 */
export function useKpiAccess() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.global_role === "SuperAdmin";
  const isReviewer = profile?.kpi_role === "reviewer";
  return {
    isSuperAdmin,
    isReviewer,
    canViewAnyStaff: isSuperAdmin || isReviewer,
    loading: false,
  };
}
```

No DB, RLS, or caller changes.
