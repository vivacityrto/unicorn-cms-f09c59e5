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

/** What the learner-chosen analytics function returns. Counts only enrolments the learner chose (source self_enrol). */
export interface TenantAcademyLearnerAnalytics {
  last_updated_at: string;
  counted_source: 'self_enrol';
  totals: {
    learners: number;
    chosen: number;
    finished: number;
    certificates: number;
    lessons_completed: number;
    minutes: number;
    active_30d: number;
    /** Enrolments added another way (not chosen by the learner); shown only so the screen can say they are left out. */
    not_counted: { enrolments: number; finished: number };
  };
  trend: Array<{ week_start: string; active_learners: number; chosen: number; finished: number; lessons: number }>;
  courses: Array<{ course_id: number; course_title: string; chosen: number; started: number; finished: number; certified: number; stalled: number; median_days: number | null }>;
  learners: Array<{ user_id: string; name: string; email: string | null; chosen: number; finished: number; lessons_completed: number; minutes: number; last_active: string | null; any_started: boolean }>;
  stalled: Array<{ name: string; course_title: string; days_quiet: number }>;
}

export function useTenantAcademyLearnerAnalytics(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ["academy", "tenant-learner-analytics", tenantId ?? "none"],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantAcademyLearnerAnalytics> => {
      const { data, error } = await rpc("get_tenant_academy_learner_analytics", { p_tenant_id: tenantId as number });
      if (error) throw error;
      return data as TenantAcademyLearnerAnalytics;
    },
  });
}

/** What get_tenant_academy_learner_detail returns for one team member (courses they chose themselves). */
export interface TenantAcademyLearnerDetail {
  last_updated_at: string;
  learner: { user_id: string; name: string; email: string | null } | null;
  totals: {
    chosen: number;
    finished: number;
    certificates: number;
    lessons_completed: number;
    lessons_total: number;
    minutes: number;
    last_active: string | null;
  };
  courses: Array<{
    course_id: number;
    course_title: string;
    enrolled_at: string | null;
    completed_at: string | null;
    started: boolean;
    certified: boolean;
    lessons_total: number;
    lessons_completed: number;
    minutes: number;
    last_touch: string | null;
  }>;
  trend: Array<{ week_start: string; lessons: number; minutes: number }>;
}

export function useTenantAcademyLearnerDetail(tenantId: number | null | undefined, userId: string | null | undefined) {
  return useQuery({
    queryKey: ["academy", "tenant-learner-detail", tenantId ?? "none", userId ?? "none"],
    enabled: !!tenantId && !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantAcademyLearnerDetail> => {
      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        params: Record<string, number | string>,
      ) => Promise<{ data: unknown; error: Error | null }>)("get_tenant_academy_learner_detail", { p_tenant_id: tenantId as number, p_user_id: userId as string });
      if (error) throw error;
      return data as TenantAcademyLearnerDetail;
    },
  });
}
