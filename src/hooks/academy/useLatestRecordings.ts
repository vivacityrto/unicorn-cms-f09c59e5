import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LatestRecording {
  id: number;
  title: string;
  thumbnail: string | null;
  deliveryDate: string | null;
  estimatedMinutes: number | null;
  courseSlug: string;
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
      const today = new Date().toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug, thumbnail_url, delivery_date, estimated_minutes")
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
      }));
    },
  });
}
