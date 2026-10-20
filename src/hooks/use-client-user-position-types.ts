import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

/** `user_id` -> `position_type` (null when none is set) for the active client's people. */
export type UserPositionTypes = Record<string, string | null>;

export function clientUserPositionTypesKey(tenantId: number | null) {
  return ["client_user_position_types", tenantId] as const;
}

/**
 * Position types for the people shown in the client portal Users table.
 *
 * Read through `get_client_tenant_user_position_types` (same visibility as
 * `get_client_tenant_users`) because RLS on `tenant_users` only lets a user
 * see their own row, which would leave every other row blank.
 */
export function useClientUserPositionTypes() {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: clientUserPositionTypesKey(activeTenantId),
    enabled: !!activeTenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<UserPositionTypes> => {
      const { data, error } = await supabase.rpc("get_client_tenant_user_position_types", {
        p_tenant_id: activeTenantId!,
      });
      if (error) throw error;
      const map: UserPositionTypes = {};
      for (const row of data ?? []) map[row.user_id] = row.position_type ?? null;
      return map;
    },
  });
}
