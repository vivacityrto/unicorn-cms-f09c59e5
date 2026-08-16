import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";

export interface MyEnrolledCourse {
  enrollment_id: number;
  course_id: number;
  course_title: string;
  course_slug: string;
  course_description: string | null;
  thumbnail_url: string | null;
  estimated_minutes: number | null;
  enrollment_status: string | null;
  total_lessons: number;
  completed_lessons: number;
  progress_percentage: number;
  module_count: number;
  next_lesson: { slug: string; lessonId: number } | null;
  has_certificate: boolean;
  webinar_series: string | null;
}

export function useMyEnrolledCourses() {
  const { userId } = useAcademyActingUserId();
  return useQuery<MyEnrolledCourse[]>({
    queryKey: ["academy-my-enrolled-courses", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data: progress, error: progErr } = await supabase
        .from("v_academy_course_progress")
        .select(
          "enrollment_id, course_id, course_title, enrollment_status, estimated_minutes, total_lessons, completed_lessons, progress_percentage, has_certificate, last_activity_at"
        )
        .eq("user_id", userId);
      if (progErr) throw progErr;
      if (!progress || progress.length === 0) return [];

      const courseIds = progress.map((p: any) => p.course_id).filter(Boolean) as number[];

      const [coursesRes, modulesRes, lessonsRes, completedRes] = await Promise.all([
        supabase
          .from("academy_courses")
          .select("id, slug, description, thumbnail_url, webinar_series")
          .in("id", courseIds),
        supabase
          .from("academy_modules")
          .select("id, course_id, sort_order")
          .in("course_id", courseIds)
          .eq("is_published", true)
          .order("sort_order"),
        supabase
          .from("academy_lessons")
          .select("id, course_id, module_id, sort_order")
          .in("course_id", courseIds)
          .eq("is_published", true)
          .order("sort_order"),
        supabase
          .from("academy_lesson_progress")
          .select("lesson_id")
          .eq("user_id", userId)
          .eq("is_completed", true),
      ]);

      const courseMap = new Map<number, { slug: string; description: string | null; thumbnail_url: string | null; webinar_series: string | null }>();
      (coursesRes.data ?? []).forEach((c: any) =>
        courseMap.set(c.id, { slug: c.slug, description: c.description, thumbnail_url: c.thumbnail_url, webinar_series: c.webinar_series ?? null })
      );

      const moduleCountByCourse = new Map<number, number>();
      const moduleSortByCourse = new Map<number, Map<number, number>>();
      (modulesRes.data ?? []).forEach((m: any) => {
        moduleCountByCourse.set(m.course_id, (moduleCountByCourse.get(m.course_id) ?? 0) + 1);
        if (!moduleSortByCourse.has(m.course_id)) moduleSortByCourse.set(m.course_id, new Map());
        moduleSortByCourse.get(m.course_id)!.set(m.id, m.sort_order ?? 0);
      });

      const completedSet = new Set<number>(
        (completedRes.data ?? []).map((r: any) => r.lesson_id as number)
      );

      const lessonsByCourse = new Map<number, { id: number; module_id: number; sort_order: number }[]>();
      (lessonsRes.data ?? []).forEach((l: any) => {
        const arr = lessonsByCourse.get(l.course_id) ?? [];
        arr.push({ id: l.id, module_id: l.module_id, sort_order: l.sort_order ?? 0 });
        lessonsByCourse.set(l.course_id, arr);
      });
      lessonsByCourse.forEach((lessons, courseId) => {
        const moduleSort = moduleSortByCourse.get(courseId);
        lessons.sort((a, b) => {
          const ma = moduleSort?.get(a.module_id) ?? 0;
          const mb = moduleSort?.get(b.module_id) ?? 0;
          if (ma !== mb) return ma - mb;
          return a.sort_order - b.sort_order;
        });
      });

      return progress.map((p: any) => {
        const meta = courseMap.get(p.course_id);
        const lessons = lessonsByCourse.get(p.course_id) ?? [];
        const nextLesson = lessons.find((l) => !completedSet.has(l.id));
        return {
          enrollment_id: p.enrollment_id,
          course_id: p.course_id,
          course_title: p.course_title,
          course_slug: meta?.slug ?? "",
          course_description: meta?.description ?? null,
          thumbnail_url: meta?.thumbnail_url ?? null,
          estimated_minutes: p.estimated_minutes,
          enrollment_status: p.enrollment_status,
          total_lessons: p.total_lessons ?? lessons.length,
          completed_lessons: p.completed_lessons ?? 0,
          progress_percentage: p.progress_percentage ?? 0,
          module_count: moduleCountByCourse.get(p.course_id) ?? 0,
          next_lesson:
            nextLesson && meta?.slug
              ? { slug: meta.slug, lessonId: nextLesson.id }
              : null,
          has_certificate: p.has_certificate ?? false,
          webinar_series: meta?.webinar_series ?? null,
        };
      });
    },
    staleTime: 30_000,
  });
}
