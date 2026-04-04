import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const QUERY_KEY = "academy-courses-admin";

export interface AdminCourse {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  target_audience: string | null;
  estimated_minutes: number | null;
  difficulty_level: string | null;
  status: string | null;
  tags: string[] | null;
  certificate_enabled: boolean | null;
  is_free: boolean | null;
  pass_score: number | null;
  sort_order: number | null;
  created_at: string | null;
  published_at: string | null;
  module_count: number;
  lesson_count: number;
  enrollment_count: number;
}

interface CourseFilters {
  status?: string;
  audience?: string;
  search?: string;
}

export function useAdminAcademyCourses(filters?: CourseFilters) {
  return useQuery<AdminCourse[]>({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      let q = supabase
        .from("academy_courses")
        .select("id, title, slug, description, short_description, thumbnail_url, target_audience, estimated_minutes, difficulty_level, status, tags, certificate_enabled, is_free, pass_score, sort_order, created_at, published_at")
        .order("sort_order", { ascending: true });

      if (filters?.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }
      if (filters?.audience) {
        q = q.ilike("target_audience", `%${filters.audience}%`);
      }
      if (filters?.search) {
        q = q.ilike("title", `%${filters.search}%`);
      }

      const { data: courses, error } = await q;
      if (error) throw error;
      if (!courses?.length) return [];

      const courseIds = courses.map((c: any) => c.id);

      // Parallel counts
      const [{ data: modules }, { data: lessons }, { data: enrollments }] = await Promise.all([
        supabase.from("academy_modules").select("id, course_id").in("course_id", courseIds),
        supabase.from("academy_lessons").select("id, course_id").in("course_id", courseIds),
        supabase.from("academy_enrollments").select("id, course_id").in("course_id", courseIds).eq("status", "active"),
      ]);

      const moduleCount = new Map<number, number>();
      const lessonCount = new Map<number, number>();
      const enrollCount = new Map<number, number>();

      (modules ?? []).forEach((m: any) => moduleCount.set(m.course_id, (moduleCount.get(m.course_id) || 0) + 1));
      (lessons ?? []).forEach((l: any) => lessonCount.set(l.course_id, (lessonCount.get(l.course_id) || 0) + 1));
      (enrollments ?? []).forEach((e: any) => enrollCount.set(e.course_id, (enrollCount.get(e.course_id) || 0) + 1));

      return courses.map((c: any) => ({
        ...c,
        module_count: moduleCount.get(c.id) || 0,
        lesson_count: lessonCount.get(c.id) || 0,
        enrollment_count: enrollCount.get(c.id) || 0,
      }));
    },
    staleTime: 30_000,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<AdminCourse>) => {
      const { data: row, error } = await supabase
        .from("academy_courses")
        .insert(data as any)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => {
      toast.success("Course created");
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create course"),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AdminCourse> }) => {
      const { error } = await supabase
        .from("academy_courses")
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Course updated");
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update course"),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("academy_courses")
        .update({ status: "archived", archived_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Course archived");
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to archive course"),
  });
}

export function usePublishCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("academy_courses")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_by: user?.id ?? null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Course published");
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to publish course"),
  });
}
