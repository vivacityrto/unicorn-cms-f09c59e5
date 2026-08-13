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
      // Client-side auth can't read arbitrary `users` rows (RLS scopes reads
      // to self / own tenant / assigned CSC), but a course facilitator's
      // name is meant to be public to anyone who can see that published
      // course — so this goes through a SECURITY DEFINER RPC that only
      // ever returns a name already surfaced as a published course's
      // facilitator_id, not an arbitrary users lookup.
      const { data, error } = await supabase.rpc("get_academy_facilitator_names_safe", {
        p_facilitator_ids: facilitatorIds,
      });
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
