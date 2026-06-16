import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const userCapacityKeys = {
  all: ["user-capacity"] as const,
  tenant: (tenantId: number | null | undefined) =>
    ["user-capacity", tenantId ?? "none"] as const,
};

export interface UserCapacity {
  used: number;
  limit: number | null;
  isUnlimited: boolean;
  atLimit: boolean;
}

export function useUserCapacity(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: userCapacityKeys.tenant(tenantId),
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<UserCapacity> => {
      const { data, error } = await supabase
        .rpc("get_tenant_user_capacity", { p_tenant_id: tenantId as number })
        .single();
      if (error) throw error;
      const row = data as { used: number; limit: number | null; is_unlimited: boolean };
      const used = row.used ?? 0;
      const limit = row.limit;
      const isUnlimited = !!row.is_unlimited;
      return {
        used,
        limit,
        isUnlimited,
        atLimit: !isUnlimited && limit !== null && used >= limit,
      };
    },
  });
}

export function useInvalidateUserCapacity() {
  const qc = useQueryClient();
  return (tenantId?: number | null) => {
    void qc.invalidateQueries({
      queryKey: tenantId ? userCapacityKeys.tenant(tenantId) : userCapacityKeys.all,
    });
  };
}
