import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MODULES_KEY = "academy-modules-lessons";

export interface AcademyModule {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  sort_order: number;
  is_published: boolean | null;
  lessons: AcademyLesson[];
}

export interface AcademyLesson {
  id: number;
  module_id: number;
  course_id: number;
  title: string;
  description: string | null;
  lesson_type: string | null;
  sort_order: number;
  is_published: boolean | null;
  is_preview: boolean | null;
  estimated_minutes: number | null;
  video_id: string | null;
  resource_id: string | null;
  content_markdown: string | null;
}

export function useModulesWithLessons(courseId: number | null) {
  return useQuery<AcademyModule[]>({
    queryKey: [MODULES_KEY, courseId],
    enabled: !!courseId,
    queryFn: async () => {
      if (!courseId) return [];

      const [{ data: modules, error: mErr }, { data: lessons, error: lErr }] = await Promise.all([
        supabase
          .from("academy_modules")
          .select("id, course_id, title, description, sort_order, is_published")
          .eq("course_id", courseId)
          .order("sort_order"),
        supabase
          .from("academy_lessons")
          .select("id, module_id, course_id, title, description, lesson_type, sort_order, is_published, is_preview, estimated_minutes, video_id, resource_id, content_markdown")
          .eq("course_id", courseId)
          .order("sort_order"),
      ]);

      if (mErr) throw mErr;
      if (lErr) throw lErr;

      const lessonsByModule = new Map<number, AcademyLesson[]>();
      (lessons ?? []).forEach((l: any) => {
        const arr = lessonsByModule.get(l.module_id) || [];
        arr.push(l);
        lessonsByModule.set(l.module_id, arr);
      });

      return (modules ?? []).map((m: any) => ({
        ...m,
        lessons: lessonsByModule.get(m.id) || [],
      }));
    },
    staleTime: 30_000,
  });
}

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, data }: { courseId: number; data: { title: string; description?: string; sort_order?: number } }) => {
      const { data: row, error } = await supabase
        .from("academy_modules")
        .insert({ course_id: courseId, ...data } as any)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: (_, vars) => {
      toast.success("Module created");
      qc.invalidateQueries({ queryKey: [MODULES_KEY, vars.courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create module"),
  });
}

export function useUpdateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, courseId, data }: { id: number; courseId: number; data: Record<string, any> }) => {
      const { error } = await supabase.from("academy_modules").update(data as any).eq("id", id);
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      toast.success("Module updated");
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update module"),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, courseId }: { id: number; courseId: number }) => {
      const { error } = await supabase.from("academy_modules").delete().eq("id", id);
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      toast.success("Module deleted");
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete module"),
  });
}

export function useReorderModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, orderedIds }: { courseId: number; orderedIds: number[] }) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from("academy_modules").update({ sort_order: i + 1 } as any).eq("id", id)
      );
      await Promise.all(updates);
      return courseId;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to reorder modules"),
  });
}

export function useCreateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ moduleId, courseId, data }: { moduleId: number; courseId: number; data: Record<string, any> }) => {
      const { data: row, error } = await supabase
        .from("academy_lessons")
        .insert({ module_id: moduleId, course_id: courseId, ...data } as any)
        .select()
        .single();
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      toast.success("Lesson created");
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create lesson"),
  });
}

export function useUpdateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, courseId, data }: { id: number; courseId: number; data: Record<string, any> }) => {
      const { error } = await supabase.from("academy_lessons").update(data as any).eq("id", id);
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      toast.success("Lesson updated");
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update lesson"),
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, courseId }: { id: number; courseId: number }) => {
      const { error } = await supabase.from("academy_lessons").delete().eq("id", id);
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      toast.success("Lesson deleted");
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete lesson"),
  });
}

export function useReorderLessons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ moduleId, courseId, orderedIds }: { moduleId: number; courseId: number; orderedIds: number[] }) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from("academy_lessons").update({ sort_order: i + 1 } as any).eq("id", id)
      );
      await Promise.all(updates);
      return courseId;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: [MODULES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to reorder lessons"),
  });
}
