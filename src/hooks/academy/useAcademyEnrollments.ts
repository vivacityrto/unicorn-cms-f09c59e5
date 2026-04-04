import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ENROL_KEY = "academy-enrolments";

export interface EnrichedEnrollment {
  id: number;
  course_id: number;
  user_id: string;
  tenant_id: number | null;
  status: string | null;
  source: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  notes: string | null;
  course: { id: number; title: string; slug: string } | null;
  user: { user_uuid: string; first_name: string; last_name: string; email: string; avatar_url: string | null } | null;
  tenant: { id: number; name: string } | null;
}

interface EnrollmentFilters {
  status?: string;
  source?: string;
  courseId?: string;
  tenantId?: string;
  search?: string;
}

export function useAdminEnrollments(filters?: EnrollmentFilters) {
  return useQuery<EnrichedEnrollment[]>({
    queryKey: [ENROL_KEY, filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_enrollments")
        .select("*")
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];

      const courseIds = [...new Set(data.map((e: any) => e.course_id))];
      const userIds = [...new Set(data.map((e: any) => e.user_id))];
      const tenantIds = [...new Set(data.map((e: any) => e.tenant_id).filter(Boolean))] as number[];

      const [coursesRes, usersRes, tenantsRes] = await Promise.all([
        supabase.from("academy_courses").select("id, title, slug").in("id", courseIds),
        supabase.from("users").select("user_uuid, first_name, last_name, email, avatar_url").in("user_uuid", userIds),
        tenantIds.length > 0
          ? supabase.from("tenants").select("id, name").in("id", tenantIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const courseMap = new Map((coursesRes.data ?? []).map((c: any) => [c.id, c]));
      const userMap = new Map((usersRes.data ?? []).map((u: any) => [u.user_uuid, u]));
      const tenantMap = new Map(((tenantsRes as any).data ?? []).map((t: any) => [t.id, t]));

      return data.map((e: any) => ({
        ...e,
        course: courseMap.get(e.course_id) || null,
        user: userMap.get(e.user_id) || null,
        tenant: e.tenant_id ? tenantMap.get(e.tenant_id) || null : null,
      }));
    },
    staleTime: 30_000,
  });
}

export function useEnrollmentProgress() {
  return useQuery({
    queryKey: ["academy-progress"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_academy_course_progress")
        .select("*");
      if (error) throw error;

      const map = new Map<number, { progress_percentage: number | null; completed_lessons: number | null; total_lessons: number | null }>();
      (data ?? []).forEach((p: any) => {
        if (p.enrollment_id) map.set(p.enrollment_id, p);
      });
      return map;
    },
    staleTime: 30_000,
  });
}

export function useEnrollUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, userId, tenantId, options }: {
      courseId: number; userId: string; tenantId?: number | null;
      options?: { source?: string; expires_at?: string; notes?: string };
    }) => {
      const { error } = await supabase
        .from("academy_enrollments")
        .insert({
          course_id: courseId,
          user_id: userId,
          tenant_id: tenantId ?? null,
          status: "active",
          source: options?.source ?? "manual",
          expires_at: options?.expires_at ?? null,
          notes: options?.notes ?? null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User enrolled");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to enrol user"),
  });
}

export function useEnrollTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, tenantId, options }: {
      courseId: number; tenantId: number;
      options?: { source?: string; expires_at?: string };
    }) => {
      // Get all users in this tenant
      const { data: tenantUsers, error: tuErr } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId);
      if (tuErr) throw tuErr;
      if (!tenantUsers?.length) throw new Error("No users found in this tenant");

      const rows = tenantUsers.map((tu: any) => ({
        course_id: courseId,
        user_id: tu.user_id,
        tenant_id: tenantId,
        status: "active",
        source: options?.source ?? "bulk",
        expires_at: options?.expires_at ?? null,
      }));

      const { error } = await supabase.from("academy_enrollments").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tenant users enrolled");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to enrol tenant"),
  });
}

export function useRevokeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("academy_enrollments")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_by: user?.id ?? null,
          revoke_reason: reason ?? null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolment revoked");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to revoke enrolment"),
  });
}

export function useReactivateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("academy_enrollments")
        .update({ status: "active", revoked_at: null, revoke_reason: null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolment reactivated");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: () => toast.error("Failed to reactivate"),
  });
}

export function useExtendEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: number; date: string }) => {
      const { error } = await supabase
        .from("academy_enrollments")
        .update({ expires_at: date } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expiry extended");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: () => toast.error("Failed to extend expiry"),
  });
}

export function useLessonProgress(enrollmentId: number | null) {
  return useQuery({
    queryKey: ["academy-lesson-progress", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lesson_progress")
        .select("*")
        .eq("enrollment_id", enrollmentId!);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

/** Fetch filter options for courses and tenants */
export function useEnrollmentFilterOptions() {
  const coursesQuery = useQuery({
    queryKey: ["academy-courses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_courses").select("id, title").order("title");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const tenantsQuery = useQuery({
    queryKey: ["academy-tenants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  return { courses: coursesQuery.data ?? [], tenants: tenantsQuery.data ?? [] };
}
