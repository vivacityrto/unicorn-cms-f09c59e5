import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LatestRecording {
  id: string;
  video_name: string;
  thumbnail: string | null;
  duration_seconds: number | null;
  folder_name: string | null;
  lessonId: number;
  courseSlug: string;
}

export function useLatestRecordings() {
  return useQuery({
    queryKey: ["latest-recordings"],
    queryFn: async (): Promise<LatestRecording[]> => {
      const { data, error } = await supabase
        .from("training_videos")
        .select(`
          id,
          video_name,
          thumbnail,
          duration_seconds,
          folder_name,
          created_at,
          academy_lessons!video_id(
            id,
            is_published,
            lesson_type,
            academy_courses!course_id(slug)
          )
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data ?? []).flatMap((video: any) => {
        const lessons = video.academy_lessons as Array<{
          id: number;
          is_published: boolean | null;
          lesson_type: string | null;
          academy_courses: { slug: string } | null;
        }>;
        const lesson = lessons?.find(
          (l) => l.is_published === true && l.lesson_type === "video"
        );
        if (!lesson || !lesson.academy_courses) return [];
        return [{
          id: video.id,
          video_name: video.video_name,
          thumbnail: video.thumbnail,
          duration_seconds: video.duration_seconds,
          folder_name: video.folder_name,
          lessonId: lesson.id,
          courseSlug: lesson.academy_courses.slug,
        }];
      });
    },
  });
}
