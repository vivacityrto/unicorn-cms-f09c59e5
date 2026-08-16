import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LatestRecording {
  id: number;
  title: string;
  thumbnail: string | null;
  deliveryDate: string | null;
  estimatedMinutes: number | null;
  courseSlug: string;
  webinarSeries: string | null;
}

/**
 * Most recently *delivered* published courses (by delivery_date), not most
 * recently uploaded video — a course can be re-recorded/re-edited long after
 * it was actually run, so upload time doesn't reflect what clients mean by
 * "recent".
 */
export function useLatestRecordings() {
  return useQuery({
    queryKey: ["latest-recordings"],
    queryFn: async (): Promise<LatestRecording[]> => {
      // The course-builder date field has no upper bound, so a course
      // pre-published ahead of an upcoming live session could carry a
      // future delivery_date — exclude those so "recent" only ever means
      // already-delivered content, not something scheduled but not yet run.
      // Uses local calendar date, not toISOString()'s UTC — delivery_date
      // is a local date from the course-builder date picker, and
      // toISOString() would still read as yesterday for the first ~10-11
      // hours of the day in Australian timezones.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug, thumbnail_url, delivery_date, estimated_minutes, webinar_series")
        .eq("status", "published")
        .not("delivery_date", "is", null)
        .lte("delivery_date", today)
        .order("delivery_date", { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data ?? []).map((course) => ({
        id: course.id,
        title: course.title,
        thumbnail: course.thumbnail_url,
        deliveryDate: course.delivery_date,
        estimatedMinutes: course.estimated_minutes,
        courseSlug: course.slug,
        webinarSeries: course.webinar_series ?? null,
      }));
    },
  });
}
