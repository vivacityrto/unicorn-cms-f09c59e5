import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** One row from get_tenant_academy_staff_stats (deployed RPC; not yet in generated types). */
export interface TenantAcademyStaffStatsRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  last_login_at: string | null;
  login_count_90d: number;
  enrollments_total: number;
  enrollments_completed: number;
  enrollments_active: number;
  pd_hours_completed: number;
  certificates_earned: number;
  last_activity_at: string | null;
}

function sortByLastActivityDesc(
  rows: TenantAcademyStaffStatsRow[],
): TenantAcademyStaffStatsRow[] {
  return [...rows].sort((a, b) => {
    if (a.last_activity_at == null && b.last_activity_at == null) return 0;
    if (a.last_activity_at == null) return 1;
    if (b.last_activity_at == null) return -1;
    return b.last_activity_at.localeCompare(a.last_activity_at);
  });
}

export function useTenantAcademyStaffStats(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ["academy", "tenant-staff-stats", tenantId ?? "none"],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantAcademyStaffStatsRow[]> => {
      const { data, error } = await (supabase as any).rpc(
        "get_tenant_academy_staff_stats",
        { p_tenant_id: tenantId as number },
      );
      if (error) throw error;
      const rows = (data as TenantAcademyStaffStatsRow[] | null) ?? [];
      return sortByLastActivityDesc(rows);
    },
  });
}
