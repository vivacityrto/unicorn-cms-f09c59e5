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
