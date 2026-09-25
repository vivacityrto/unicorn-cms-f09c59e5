import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientTenantUserRow } from "@/features/client-identity/models";

export type { ClientTenantUserRow } from "@/features/client-identity/models";

export function academyTenantUsersKey(tenantId: number | null) {
  return ["academy_tenant_users", tenantId] as const;
}

/**
 * Academy-scoped view of a tenant's roster: reuses the same tenant-scoped,
 * authorization-checked get_client_tenant_users RPC as the client portal's
 * Users page (superadmin/vivacity staff may pass any tenant_id — see
 * 20260806020000_get_client_tenant_users_tenant_scoped_rpc.sql), filtered
 * down to academy_user rows only.
 */
export function useAcademyTenantUsers(tenantId: number | null) {
  return useQuery({
    queryKey: academyTenantUsersKey(tenantId),
    enabled: tenantId != null,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTenantUserRow[]> => {
      const { data, error } = await supabase
        .rpc("get_client_tenant_users", { p_tenant_id: tenantId! })
        .order("row_type", { ascending: true })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ClientTenantUserRow[]).filter(
        (row) => row.relationship_role === "academy_user",
      );
    },
  });
}
