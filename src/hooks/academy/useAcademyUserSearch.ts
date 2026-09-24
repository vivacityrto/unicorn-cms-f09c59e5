import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AcademyUserMatch {
  user_uuid: string;
  full_name: string;
  email: string;
}

/**
 * Given a search string, finds users whose name/email match and returns a
 * map of tenant_id -> matched users at that tenant (via tenant_users), so a
 * tenant search bar can also surface tenants by a user's name/email.
 */
export function useAcademyUserTenantMatches(search: string) {
  const trimmed = search.trim();
  return useQuery<Map<number, AcademyUserMatch[]>>({
    queryKey: ["academy-user-tenant-matches", trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
        .limit(20);
      if (usersError) throw usersError;
      if (!users?.length) return new Map();

      const userIds = users.map((u) => u.user_uuid);
      const { data: memberships, error: membershipsError } = await supabase
        .from("tenant_users")
        .select("tenant_id, user_id")
        .in("user_id", userIds);
      if (membershipsError) throw membershipsError;

      const userMap = new Map(
        users.map((u) => [
          u.user_uuid,
          { user_uuid: u.user_uuid, full_name: `${u.first_name} ${u.last_name}`.trim(), email: u.email },
        ]),
      );

      const result = new Map<number, AcademyUserMatch[]>();
      (memberships ?? []).forEach((m) => {
        if (m.tenant_id == null) return;
        const user = userMap.get(m.user_id);
        if (!user) return;
        const existing = result.get(m.tenant_id) ?? [];
        if (!existing.some((u) => u.user_uuid === user.user_uuid)) {
          existing.push(user);
        }
        result.set(m.tenant_id, existing);
      });
      return result;
    },
    staleTime: 15_000,
  });
}
