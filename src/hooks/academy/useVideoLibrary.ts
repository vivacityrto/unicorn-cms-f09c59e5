import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VideoItem {
  id: string;
  video_name: string;
  vimeo_url: string | null;
  thumbnail: string | null;
  folder_name: string | null;
  folder_id: string | null;
  added_by: string | null;
}

interface VideoFilters {
  search?: string;
  folderName?: string;
  assignedOnly?: boolean;
}

export function useVideoLibrary(filters?: VideoFilters) {
  return useQuery<VideoItem[]>({
    queryKey: ["video-library", filters],
    queryFn: async () => {
      let q = supabase
        .from("training_videos")
        .select("id, video_name, vimeo_url, thumbnail, folder_name, folder_id, added_by")
        .order("video_name");

      if (filters?.search) {
        q = q.ilike("video_name", `%${filters.search}%`);
      }
      if (filters?.folderName) {
        q = q.eq("folder_name", filters.folderName);
      }

      const { data, error } = await q;
      if (error) throw error;

      let videos = data ?? [];

      if (filters?.assignedOnly) {
        const videoIds = videos.map((v) => v.id);
        if (videoIds.length > 0) {
          const { data: lessons } = await supabase
            .from("academy_lessons")
            .select("video_id")
            .in("video_id", videoIds);
          const assignedIds = new Set((lessons ?? []).map((l: any) => l.video_id));
          videos = videos.filter((v) => assignedIds.has(v.id));
        }
      }

      return videos;
    },
    staleTime: 60_000,
  });
}

export function useVideoFolders() {
  return useQuery<{ folder_name: string; count: number }[]>({
    queryKey: ["video-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_videos")
        .select("folder_name");
      if (error) throw error;

      const countMap = new Map<string, number>();
      (data ?? []).forEach((v: any) => {
        const name = v.folder_name || "Uncategorised";
        countMap.set(name, (countMap.get(name) || 0) + 1);
      });

      return [...countMap.entries()]
        .map(([folder_name, count]) => ({ folder_name, count }))
        .sort((a, b) => a.folder_name.localeCompare(b.folder_name));
    },
    staleTime: 60_000,
  });
}

export function useVideoAssignments(videoIds: string[]) {
  return useQuery({
    queryKey: ["video-assignments", videoIds],
    enabled: videoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select("id, title, video_id, course_id")
        .in("video_id", videoIds);
      if (error) throw error;

      const map = new Map<string, { lesson_id: number; lesson_title: string; course_id: number }[]>();
      (data ?? []).forEach((l: any) => {
        const arr = map.get(l.video_id) || [];
        arr.push({ lesson_id: l.id, lesson_title: l.title, course_id: l.course_id });
        map.set(l.video_id, arr);
      });
      return map;
    },
    staleTime: 30_000,
  });
}
