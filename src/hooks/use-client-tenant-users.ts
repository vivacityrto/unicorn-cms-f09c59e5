import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import type { ClientTenantUserRow } from "@/features/client-identity/models";

export type {
  ClientTenantUserRow,
  TenantUserRelationshipRole,
  TenantUserRowType,
  TenantUserStatus,
} from "@/features/client-identity/models";

export function useClientTenantUsers() {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: ["client_tenant_users", activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTenantUserRow[]> => {
      const { data, error } = await supabase
        .rpc("get_client_tenant_users", { p_tenant_id: activeTenantId! })
        .order("row_type", { ascending: true })
        .order("primary_contact", { ascending: false, nullsFirst: false })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientTenantUserRow[];
    },
  });
}
