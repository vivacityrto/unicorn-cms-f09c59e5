import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mapUserCapacity,
  type UserCapacity,
  type UserCapacityRpcRow,
} from "@/features/client-identity/models";

export type { UserCapacity } from "@/features/client-identity/models";
export const userCapacityKeys = {
  all: ["user-capacity"] as const,
  tenant: (tenantId: number | null | undefined) =>
    ["user-capacity", tenantId ?? "none"] as const,
};

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
      return mapUserCapacity(data as UserCapacityRpcRow);
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
