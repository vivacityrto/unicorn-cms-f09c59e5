import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Staff-only facilitator name resolver — queries `users` directly rather
 * than the published-course-scoped RPC used by client-facing surfaces
 * (see useFacilitatorNames), because course builder pages need to resolve
 * facilitators on draft/unpublished courses too. Safe here specifically
 * because every caller is gated behind ProtectedRoute requireSuperAdmin,
 * so the querying user always passes the users_select_staff RLS policy.
 */
export function useStaffFacilitatorNames(facilitatorIds: string[]) {
  return useQuery({
    queryKey: ["academy-staff-facilitator-names", facilitatorIds],
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
    staleTime: 5 * 60_000,
  });
}
