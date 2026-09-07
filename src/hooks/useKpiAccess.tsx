import { useAuth } from "@/hooks/useAuth";

/**
 * Whether the current user can view any staff member's KPI dashboard.
 * True for SuperAdmins and profiles where `users.kpi_role = 'reviewer'`.
 */
export function useKpiAccess() {
  const { profile, loading, isSuperAdmin: checkIsSuperAdmin } = useAuth();
  // Checks both global_role (legacy) and unicorn_role (current standard) —
  // a profile with only unicorn_role === 'Super Admin' set was previously
  // missed here, hiding the Team KPI toggle for real SuperAdmin accounts.
  const isSuperAdmin = checkIsSuperAdmin();
  const isReviewer = profile?.kpi_role === "reviewer";
  return {
    isSuperAdmin,
    isReviewer,
    canViewAnyStaff: isSuperAdmin || isReviewer,
    loading,
  };
}
