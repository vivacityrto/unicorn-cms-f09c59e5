import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AcademyCourse {
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

export function useAcademyCourses({ audienceKey }: UseAcademyCoursesOptions) {
  return useQuery({
    queryKey: ["academy-courses", audienceKey],
    queryFn: async (): Promise<AcademyCourse[]> => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch published courses for this audience
      const { data: courses, error: coursesErr } = await supabase
        .from("academy_courses")
        .select("id, title, slug, description, short_description, thumbnail_url, target_audience, estimated_minutes, difficulty_level, status, tags")
        .eq("status", "published")
        .ilike("target_audience", `%${audienceKey}%`);

      if (coursesErr) throw coursesErr;
      if (!courses || courses.length === 0) return [];

      // Fetch progress for current user (separate query to avoid TS2589)
      let progressMap = new Map<number, {
        enrollment_status: string | null;
        progress_percentage: number | null;
        completed_lessons: number | null;
        total_lessons: number | null;
        has_certificate: boolean | null;
        certificate_number: string | null;
      }>();

      if (user) {
        const { data: progress } = await supabase
          .from("v_academy_course_progress")
          .select("course_id, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, certificate_number")
          .eq("user_id", user.id);

        if (progress) {
          for (const p of progress) {
            if (p.course_id) progressMap.set(p.course_id, p);
          }
        }
      }

      return courses.map((c) => {
        const p = progressMap.get(c.id);
        return {
          ...c,
          enrollment_status: p?.enrollment_status ?? null,
          progress_percentage: p?.progress_percentage ?? 0,
          completed_lessons: p?.completed_lessons ?? 0,
          total_lessons: p?.total_lessons ?? 0,
          has_certificate: p?.has_certificate ?? false,
          certificate_number: p?.certificate_number ?? null,
        };
      });
    },
    staleTime: 30_000,
  });
}

/** Dashboard stats hook */
export function useAcademyDashboardStats() {
  return useQuery({
    queryKey: ["academy-dashboard-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // Parallel queries
      const [coursesRes, inProgressRes, certsRes] = await Promise.all([
        supabase.from("academy_courses").select("id", { count: "exact", head: true }).eq("status", "published"),
        user
          ? supabase.from("academy_enrollments").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active").is("completed_at", null)
          : Promise.resolve({ count: 0 }),
        user
          ? supabase.from("academy_certificates").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("revoked_at", null)
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
  return useQuery({
    queryKey: ["academy-my-courses"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: progress, error } = await supabase
        .from("v_academy_course_progress")
        .select("course_id, course_title, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, estimated_minutes")
        .eq("user_id", user.id)
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
export function getCourseCategory(tags: string[] | null, targetAudience: string | null): string {
  if (tags && tags.length > 0) return tags[0];
  if (targetAudience) {
    const parts = targetAudience.split(",").map(s => s.trim());
    const labelMap: Record<string, string> = {
      trainer: "Trainer",
      compliance_manager: "Compliance",
      governance_person: "Governance",
    };
    return labelMap[parts[0]] ?? parts[0];
  }
  return "General";
}
