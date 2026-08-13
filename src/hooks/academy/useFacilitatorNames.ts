import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Batch-resolves `academy_courses.facilitator_id` values to display names.
 * Pass a single-element array for a one-course lookup, or all distinct ids
 * on a page for a batch lookup — same query shape either way.
 */
export function useFacilitatorNames(facilitatorIds: string[]) {
  return useQuery({
    queryKey: ["academy-facilitator-names", facilitatorIds],
    enabled: facilitatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name")
        .in("user_uuid", facilitatorIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const u of data ?? []) {
        const name = u.full_name?.trim();
        if (u.user_uuid && name) map[u.user_uuid] = name;
      }
      return map;
    },
    // No initialData — seeding {} here would mark it "fresh" per staleTime
    // and react-query would never actually call queryFn once enabled flips
    // true. Callers already default via destructuring: `data: x = {}`.
    staleTime: 5 * 60_000,
  });
}
