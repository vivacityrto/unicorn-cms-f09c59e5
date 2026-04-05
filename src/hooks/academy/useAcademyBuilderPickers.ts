import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useVideoLibraryPicker(search?: string) {
  return useQuery({
    queryKey: ["training-videos-picker", search],
    queryFn: async () => {
      let q = supabase
        .from("training_videos")
        .select("id, video_name, vimeo_url, thumbnail, folder_name")
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
