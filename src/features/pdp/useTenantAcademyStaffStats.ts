import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type UntypedRpc = (functionName: string, params: Record<string, number>) => Promise<{
  data: unknown;
  error: Error | null;
}>;

const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

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

export interface TenantAcademyAnalyticsCourse {
  course_id: number;
  course_title: string;
  course_slug: string;
  enrolled: number;
  started: number;
  in_progress: number;
  not_started: number;
  completed: number;
  certified: number;
  median_completion_days: number | null;
}

export interface TenantAcademyAnalyticsTrend {
  week_start: string;
  active_learners: number;
  enrollments: number;
  completions: number;
}

export interface TenantAcademyAnalytics {
  last_updated_at: string;
  definitions: {
    started: string;
    active_learner: string;
    median_completion_days: string;
  };
  courses: TenantAcademyAnalyticsCourse[];
  trend: TenantAcademyAnalyticsTrend[];
}

function sortByLastActivityDesc(rows: TenantAcademyStaffStatsRow[]): TenantAcademyStaffStatsRow[] {
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
      const { data, error } = await rpc("get_tenant_academy_staff_stats", { p_tenant_id: tenantId as number });
      if (error) throw error;
      return sortByLastActivityDesc((data as TenantAcademyStaffStatsRow[] | null) ?? []);
    },
  });
}

export function useTenantAcademyAnalytics(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ["academy", "tenant-analytics", tenantId ?? "none"],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantAcademyAnalytics> => {
      const { data, error } = await rpc("get_tenant_academy_analytics", { p_tenant_id: tenantId as number });
      if (error) throw error;
      return data as TenantAcademyAnalytics;
    },
  });
}
