import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CscAssignmentData {
  csc_user_id: string | null;
  csc_name: string | null;
  csc_avatar: string | null;
  csc_archived: boolean;
}

export type CscAssignmentsMap = Record<number, CscAssignmentData>;

/**
 * Returns the primary CSC assignment per tenant, joined with user profile.
 * Replaces the old fetchCscAssignmentsOnly() lightweight refresh path.
 */
export function useCscAssignments(tenantIds: number[]) {
  const sortedIds = [...tenantIds].sort((a, b) => a - b);

  return useQuery({
    queryKey: ["tenants", "csc-assignments", sortedIds],
    enabled: sortedIds.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<CscAssignmentsMap> => {
      const { data: assignments, error } = await supabase
        .from("tenant_csc_assignments")
        .select("tenant_id, csc_user_id")
        .in("tenant_id", sortedIds)
        .eq("is_primary", true)
        .is("ended_at", null);
      if (error) throw error;

      const cscMap: Record<number, string> = {};
      (assignments || []).forEach((a: any) => { cscMap[a.tenant_id] = a.csc_user_id; });

      const userUuids = [...new Set(Object.values(cscMap).filter(Boolean))];
      const { data: usersData } = userUuids.length > 0
        ? await supabase
            .from("users")
            .select("user_uuid, first_name, last_name, avatar_url, archived")
            .in("user_uuid", userUuids)
        : { data: [] as any[] };

      const userMap: Record<string, { name: string; avatar: string | null; archived: boolean }> = {};
      (usersData || []).forEach((u: any) => {
        userMap[u.user_uuid] = {
          name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
          avatar: u.avatar_url,
          archived: u.archived || false,
        };
      });

      const result: CscAssignmentsMap = {};
      sortedIds.forEach(id => {
        const uid = cscMap[id] || null;
        const u = uid ? userMap[uid] : null;
        result[id] = {
          csc_user_id: uid,
          csc_name: u?.name ?? null,
          csc_avatar: u?.avatar ?? null,
          csc_archived: u?.archived ?? false,
        };
      });
      return result;
    },
  });
}
