import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";
import { useFacilitatorNames } from "@/hooks/academy/useFacilitatorNames";

export interface AcademyCourse {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  target_audience: string[] | null;
  estimated_minutes: number | null;
  difficulty_level: string | null;
  status: string | null;
  tags: string[] | null;
  webinar_series: string | null;
  sort_order: number | null;
  certificate_enabled: boolean | null;
  delivery_date: string | null;
  facilitator_id: string | null;
  facilitator_display_name: string | null;
  // Resolved client-side from facilitator_id, see useFacilitatorNames
  facilitator_name: string | null;
  // Joined from progress view / enrollment
  enrollment_status: string | null;
  progress_percentage: number;
  completed_lessons: number;
  total_lessons: number;
  has_certificate: boolean;
  certificate_number: string | null;
}

interface UseAcademyCoursesOptions {
  audienceKey: string; // "trainer" | "compliance_manager" | "governance_person"
}

type AcademyCourseRow = Omit<AcademyCourse, "facilitator_name">;

export function useAcademyCourses({ audienceKey }: UseAcademyCoursesOptions) {
  const { userId } = useAcademyActingUserId();
  const coursesQuery = useQuery({
    queryKey: ["academy-courses", audienceKey, userId],
    queryFn: async (): Promise<AcademyCourseRow[]> => {
      // Fetch published courses for this audience
      const { data: courses, error: coursesErr } = await supabase
        .from("academy_courses")
        .select("id, title, slug, description, short_description, thumbnail_url, target_audience, estimated_minutes, difficulty_level, status, tags, webinar_series, sort_order, certificate_enabled, delivery_date, facilitator_id, facilitator_display_name")
        .eq("status", "published")
        .contains("target_audience", [audienceKey])
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("title");

      if (coursesErr) throw coursesErr;
      if (!courses || courses.length === 0) return [];

      const courseIds = courses.map((c) => c.id);

      const progressMap = new Map<number, {
        enrollment_status: string | null;
        progress_percentage: number | null;
        completed_lessons: number | null;
        total_lessons: number | null;
        has_certificate: boolean | null;
        certificate_number: string | null;
      }>();
      const lessonCountMap = new Map<number, number>();

      const [progressRes, lessonsRes] = await Promise.all([
        userId
          ? supabase
              .from("v_academy_course_progress")
              .select("course_id, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, certificate_number")
              .eq("user_id", userId)
          : Promise.resolve({ data: null as any }),
        supabase
          .from("v_academy_lesson_outline")
          .select("course_id")
          .eq("is_published", true)
          .in("course_id", courseIds),
      ]);

      if (progressRes.data) {
        for (const p of progressRes.data) {
          if (p.course_id) progressMap.set(p.course_id, p);
        }
      }

      if (lessonsRes.data) {
        for (const l of lessonsRes.data as { course_id: number | null }[]) {
          if (l.course_id == null) continue;
          lessonCountMap.set(l.course_id, (lessonCountMap.get(l.course_id) ?? 0) + 1);
        }
      }

      return courses.map((c) => {
        const p = progressMap.get(c.id);
        return {
          ...c,
          enrollment_status: p?.enrollment_status ?? null,
          progress_percentage: p?.progress_percentage ?? 0,
          completed_lessons: p?.completed_lessons ?? 0,
          total_lessons: p?.total_lessons ?? lessonCountMap.get(c.id) ?? 0,
          has_certificate: p?.has_certificate ?? false,
          certificate_number: p?.certificate_number ?? null,
        };
      });
    },
    staleTime: 30_000,
  });

  const facilitatorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of coursesQuery.data ?? []) {
      if (c.facilitator_id) ids.add(c.facilitator_id);
    }
    return [...ids];
  }, [coursesQuery.data]);

  const { data: facilitatorNameById = {} } = useFacilitatorNames(facilitatorIds);

  const data = useMemo<AcademyCourse[]>(
    () =>
      (coursesQuery.data ?? []).map((c) => ({
        ...c,
        facilitator_name: (c as any).facilitator_display_name?.trim() || (c.facilitator_id ? facilitatorNameById[c.facilitator_id] ?? null : null),
      })),
    [coursesQuery.data, facilitatorNameById],
  );

  return { ...coursesQuery, data };
}

/** Dashboard stats hook */
export function useAcademyDashboardStats() {
  const { userId } = useAcademyActingUserId();
  return useQuery({
    queryKey: ["academy-dashboard-stats", userId],
    queryFn: async () => {
      const [coursesRes, inProgressRes, certsRes] = await Promise.all([
        supabase.from("academy_courses").select("id", { count: "exact", head: true }).eq("status", "published"),
        userId
          ? supabase.from("academy_enrollments").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active").is("completed_at", null)
          : Promise.resolve({ count: 0 }),
        userId
          ? supabase.from("academy_certificates").select("id", { count: "exact", head: true }).eq("user_id", userId).is("revoked_at", null)
          : Promise.resolve({ count: 0 }),
      ]);

      return {
        courses: coursesRes.count ?? 0,
        inProgress: inProgressRes.count ?? 0,
        certificates: certsRes.count ?? 0,
        events: 0,
      };
    },
    staleTime: 60_000,
  });
}

/** My courses for the dashboard — user's enrollments with course info */
export function useMyAcademyCourses() {
  const { userId } = useAcademyActingUserId();
  return useQuery({
    queryKey: ["academy-my-courses", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data: progress, error } = await supabase
        .from("v_academy_course_progress")
        .select("course_id, course_title, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, estimated_minutes")
        .eq("user_id", userId)
        .order("last_activity_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return progress ?? [];
    },
    staleTime: 30_000,
  });
}

/** Helper: convert estimated_minutes to a readable duration string */
export function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Helper: map enrollment status to CourseCard status */
export function mapEnrollmentStatus(enrollmentStatus: string | null, hasCertificate: boolean): "not_started" | "in_progress" | "completed" {
  if (hasCertificate) return "completed";
  if (enrollmentStatus === "completed") return "completed";
  if (enrollmentStatus === "active") return "in_progress";
  return "not_started";
}

/** Helper: get first matching tag for category display */
export function getCourseCategory(tags: string[] | null, targetAudience: string[] | null): string {
  if (tags && tags.length > 0) return tags[0];
  if (targetAudience && targetAudience.length > 0) {
    const labelMap: Record<string, string> = {
      trainer: "Trainer",
      compliance_manager: "Compliance",
      governance_person: "Governance",
      student_support_officer: "Student Support",
      administration_assistant: "Administration",
    };
    return labelMap[targetAudience[0]] ?? targetAudience[0];
  }
  return "General";
}
