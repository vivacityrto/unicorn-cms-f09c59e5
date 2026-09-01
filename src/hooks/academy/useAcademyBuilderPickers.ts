import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useVideoLibraryPicker(search?: string) {
  return useQuery({
    queryKey: ["training-videos-picker", search],
    queryFn: async () => {
      let q = supabase
        .from("training_videos")
        .select("id, video_name, vimeo_url, thumbnail, folder_name, duration_seconds")
        .order("video_name");
      if (search) {
        q = q.ilike("video_name", `%${search}%`);
      }
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type AcademyThumbnailLibraryItem = {
  url: string;
  category: "course" | "banner";
  sourceCourseId: number;
  sourceCourseTitle: string;
};

/** Returns distinct custom-uploaded Academy thumbnails already referenced by courses. */
export function useAcademyThumbnailLibrary() {
  return useQuery<AcademyThumbnailLibraryItem[]>({
    queryKey: ["academy-thumbnail-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, thumbnail_url, banner_thumbnail_url")
        .order("title");
      if (error) throw error;

      const items = new Map<string, AcademyThumbnailLibraryItem>();
      for (const course of data ?? []) {
        const entries = [
          ["course", course.thumbnail_url],
          ["banner", course.banner_thumbnail_url],
        ] as const;
        for (const [category, url] of entries) {
          if (!url || !url.includes("/storage/v1/object/public/academy-thumbnails/")) continue;
          const key = `${category}:${url}`;
          if (!items.has(key)) {
            items.set(key, {
              url,
              category,
              sourceCourseId: course.id,
              sourceCourseTitle: course.title,
            });
          }
        }
      }
      return [...items.values()];
    },
    staleTime: 30_000,
  });
}

export function useResourceLibraryPicker(search?: string) {
  return useQuery({
    queryKey: ["resource-library-picker", search],
    queryFn: async () => {
      let q = supabase
        .from("resource_library")
        .select("id, title, category, version")
        .order("title");
      if (search) {
        q = q.ilike("title", `%${search}%`);
      }
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePackagesForCourseRules() {
  return useQuery({
    queryKey: ["packages-for-course-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id, name, package_type")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCoursePackageRules(courseId: number | null) {
  return useQuery({
    queryKey: ["academy-package-course-rules", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_package_course_rules")
        .select("id, package_id, course_id, is_active, created_by")
        .eq("course_id", courseId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}
