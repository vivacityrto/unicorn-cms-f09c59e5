import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

const ENROL_KEY = "academy-enrolments";

interface EnrollmentStats {
  total: number;
  active: number;
  completed: number;
  expired: number;
  revoked: number;
  auto_lifetime: number;
}

type EnrollmentTenantRow = Pick<Tables<"tenants">, "id" | "name" | "tenant_type">;

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
  course: { id: number; title: string; slug: string; thumbnail_url?: string | null } | null;
  user: { user_uuid: string; first_name: string; last_name: string; email: string; avatar_url: string | null } | null;
  tenant: { id: number; name: string; tenant_type?: string | null } | null;
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

      const courseIds = [...new Set(data.map((e) => e.course_id))];
      const userIds = [...new Set(data.map((e) => e.user_id))];
      const tenantIds = [...new Set(data.map((e) => e.tenant_id).filter(Boolean))] as number[];

      const [coursesRes, usersRes, tenantsRes] = await Promise.all([
        supabase.from("academy_courses").select("id, title, slug, thumbnail_url").in("id", courseIds),
        supabase.from("users").select("user_uuid, first_name, last_name, email, avatar_url").in("user_uuid", userIds),
        tenantIds.length > 0
          ? supabase.from("tenants").select("id, name, tenant_type").in("id", tenantIds)
          : Promise.resolve({ data: [] as EnrollmentTenantRow[] }),
      ]);

      const courseMap = new Map((coursesRes.data ?? []).map((c) => [c.id, c]));
      const userMap = new Map((usersRes.data ?? []).map((u) => [u.user_uuid, u]));
      const tenantMap = new Map((tenantsRes.data ?? []).map((t) => [t.id, t]));

      return data.map((e) => ({
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

      const map = new Map<number, Tables<"v_academy_course_progress">>();
      (data ?? []).forEach((p) => {
        if (p.enrollment_id) map.set(p.enrollment_id, p);
      });
      return map;
    },
    staleTime: 30_000,
  });
}

/** 6-tile dashboard stats via RPC */
export function useEnrollmentStats() {
  return useQuery({
    queryKey: ["academy-enrollment-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_academy_enrollment_stats");
      if (error) throw error;
      return (data as unknown as EnrollmentStats | null) ?? { total: 0, active: 0, completed: 0, expired: 0, revoked: 0, auto_lifetime: 0 };
    },
    staleTime: 30_000,
  });
}

/** Bulk-enrol N learners across M courses */
export function useBulkEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      learners: Array<{ user_id: string; tenant_id: number | null }>;
      courseIds: number[];
      expires_at?: string | null;
      notes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const rows: TablesInsert<"academy_enrollments">[] = [];
      for (const learner of params.learners) {
        for (const courseId of params.courseIds) {
          rows.push({
            course_id: courseId,
            user_id: learner.user_id,
            tenant_id: learner.tenant_id,
            status: "active",
            source: "manual",
            expires_at: params.expires_at ?? null,
            notes: params.notes ?? null,
            enrolled_by: user?.id ?? null,
          });
        }
      }
      if (!rows.length) return { created: 0, attempted: 0 };

      // Use upsert with ignoreDuplicates to skip existing (course_id, user_id) pairs
      const { data, error } = await supabase
        .from("academy_enrollments")
        .upsert(rows, { onConflict: "course_id,user_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;

      return { created: data?.length ?? 0, attempted: rows.length };
    },
    onSuccess: ({ created, attempted }) => {
      const skipped = attempted - created;
      toast.success(
        `Enrolled ${created} learner-course pairs${skipped > 0 ? ` (${skipped} skipped — already enrolled)` : ""}.`
      );
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-stats"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to bulk enrol"),
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
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User enrolled");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to enrol user"),
  });
}

export function useEnrollTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, tenantId, options }: {
      courseId: number; tenantId: number;
      options?: { source?: string; expires_at?: string };
    }) => {
      const { data: tenantUsers, error: tuErr } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId);
      if (tuErr) throw tuErr;
      if (!tenantUsers?.length) throw new Error("No users found in this tenant");

      const rows: TablesInsert<"academy_enrollments">[] = tenantUsers.map((tu) => ({
        course_id: courseId,
        user_id: tu.user_id,
        tenant_id: tenantId,
        status: "active",
        source: options?.source ?? "bulk",
        expires_at: options?.expires_at ?? null,
      }));

      const { error } = await supabase.from("academy_enrollments").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tenant users enrolled");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to enrol tenant"),
  });
}

/** Revoke via admin RPC */
export function useRevokeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const { error } = await supabase.rpc("fn_academy_admin_revoke_enrollment", {
        p_enrollment_id: id,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolment revoked");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-stats"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to revoke enrolment"),
  });
}

export function useReactivateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("fn_academy_admin_reactivate_enrollment", {
        p_enrollment_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolment reactivated");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-stats"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to reactivate"),
  });
}

export function useExtendEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: number; date: string }) => {
      const { error } = await supabase.rpc("fn_academy_admin_extend_expiry", {
        p_enrollment_id: id,
        p_new_expiry: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expiry extended");
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to extend expiry"),
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

/** Lesson detail with module grouping + video duration */
export function useLessonDetail(enrollmentId: number | null) {
  return useQuery({
    queryKey: ["academy-lesson-detail", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "fn_academy_enrollment_lesson_detail",
        { p_enrollment_id: enrollmentId! }
      );
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

/** Admin per-lesson actions */
export function useMarkLessonComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ enrollmentId, lessonId }: { enrollmentId: number; lessonId: number }) => {
      const { error } = await supabase.rpc("fn_academy_admin_mark_lesson_complete", {
        p_enrollment_id: enrollmentId,
        p_lesson_id: lessonId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Lesson marked complete");
      qc.invalidateQueries({ queryKey: ["academy-lesson-detail", vars.enrollmentId] });
      qc.invalidateQueries({ queryKey: [ENROL_KEY] });
      qc.invalidateQueries({ queryKey: ["academy-progress"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to mark complete"),
  });
}

export function useResetLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ enrollmentId, lessonId }: { enrollmentId: number; lessonId: number }) => {
      const { error } = await supabase.rpc("fn_academy_admin_reset_lesson", {
        p_enrollment_id: enrollmentId,
        p_lesson_id: lessonId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Lesson progress reset");
      qc.invalidateQueries({ queryKey: ["academy-lesson-detail", vars.enrollmentId] });
      qc.invalidateQueries({ queryKey: ["academy-progress"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to reset lesson"),
  });
}

export function useIssueCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: number) => {
      const { data, error } = await supabase.rpc("fn_academy_admin_issue_certificate", {
        p_enrollment_id: enrollmentId,
      });
      if (error) throw error;
      return data as unknown as { created?: boolean };
    },
    onSuccess: (data, enrollmentId) => {
      toast.success(data?.created ? "Certificate issued" : "Certificate already exists");
      qc.invalidateQueries({ queryKey: ["enrolment-certificate", enrollmentId] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to issue certificate"),
  });
}

export function useRevokeCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ certificateId, reason }: { certificateId: number; reason?: string }) => {
      const { error } = await supabase.rpc("fn_academy_admin_revoke_certificate", {
        p_certificate_id: certificateId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate revoked");
      qc.invalidateQueries({ queryKey: ["enrolment-certificate"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to revoke certificate"),
  });
}

/** Real-time subscription on enrolments + lesson progress */
export function useEnrollmentRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("admin-enrollments")
      .on("postgres_changes", { event: "*", schema: "public", table: "academy_enrollments" }, () => {
        qc.invalidateQueries({ queryKey: [ENROL_KEY] });
        qc.invalidateQueries({ queryKey: ["academy-enrollment-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "academy_lesson_progress" }, () => {
        qc.invalidateQueries({ queryKey: ["academy-progress"] });
        qc.invalidateQueries({ queryKey: ["academy-lesson-detail"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

/** Filter options */
export function useEnrollmentFilterOptions() {
  const coursesQuery = useQuery({
    queryKey: ["academy-courses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_courses").select("id, title, status").order("title");
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

/** Published courses (for new-enrolment modal) */
export function usePublishedCourses() {
  return useQuery({
    queryKey: ["academy-courses-published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug")
        .eq("status", "published")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** All tenant_users joined with users + tenants for the new-enrolment modal */
export function useEnrollableLearners() {
  return useQuery({
    queryKey: ["academy-enrollable-learners"],
    queryFn: async () => {
      const { data: tu, error: tuErr } = await supabase
        .from("tenant_users")
        .select("user_id, tenant_id");
      if (tuErr) throw tuErr;
      if (!tu?.length) return [];

      const userIds = [...new Set(tu.map((r) => r.user_id))];
      const tenantIds = [...new Set(tu.map((r) => r.tenant_id).filter(Boolean))] as number[];

      const [usersRes, tenantsRes] = await Promise.all([
        supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", userIds),
        tenantIds.length
          ? supabase.from("tenants").select("id, name").in("id", tenantIds)
          : Promise.resolve({ data: [] as Pick<Tables<"tenants">, "id" | "name">[] }),
      ]);

      const userMap = new Map((usersRes.data ?? []).map((u) => [u.user_uuid, u]));
      const tenantMap = new Map((tenantsRes.data ?? []).map((t) => [t.id, t]));

      // Deduplicate: one row per (user_id, tenant_id)
      const seen = new Set<string>();
      const out: Array<{ user_id: string; tenant_id: number | null; first_name: string; last_name: string; email: string; tenant_name: string }> = [];
      for (const r of tu) {
        const k = `${r.user_id}::${r.tenant_id ?? "null"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const u = userMap.get(r.user_id);
        if (!u) continue;
        const t = r.tenant_id ? tenantMap.get(r.tenant_id) : null;
        out.push({
          user_id: r.user_id,
          tenant_id: r.tenant_id ?? null,
          first_name: u.first_name ?? "",
          last_name: u.last_name ?? "",
          email: u.email ?? "",
          tenant_name: t?.name ?? "—",
        });
      }
      return out.sort((a, b) =>
        (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name)
      );
    },
    staleTime: 60_000,
  });
}
