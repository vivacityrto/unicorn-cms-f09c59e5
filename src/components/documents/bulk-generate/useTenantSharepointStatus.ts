import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TenantSpStatus = {
  tenant_id: number;
  has_shared: boolean;
  has_governance: boolean;
  fully_provisioned: boolean;
};

/**
 * Batched SharePoint provisioning status for a set of tenants.
 *
 * Predicates match the worker (do not drift):
 *   has_shared     = provisioning_status='success' OR validation_status='valid'
 *   has_governance = governance_folder_item_id IS NOT NULL
 *
 * Tenants with no tenant_sharepoint_settings row default to both flags false.
 */
export function useTenantSharepointStatus(tenantIds: number[]) {
  const key = tenantIds.length ? [...tenantIds].sort((a, b) => a - b) : [];
  return useQuery({
    queryKey: ["bulk-generate", "tenant-sp-status", key],
    enabled: key.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<number, TenantSpStatus>> => {
      const { data, error } = await supabase
        .from("tenant_sharepoint_settings")
        .select(
          "tenant_id, provisioning_status, validation_status, governance_folder_item_id",
        )
        .in("tenant_id", key);
      if (error) throw error;

      const byTenant = new Map<number, TenantSpStatus>();
      for (const t of key) {
        byTenant.set(t, {
          tenant_id: t,
          has_shared: false,
          has_governance: false,
          fully_provisioned: false,
        });
      }
      for (const row of (data ?? []) as {
        tenant_id: number;
        provisioning_status: string | null;
        validation_status: string | null;
        governance_folder_item_id: string | null;
      }[]) {
        const has_shared =
          row.provisioning_status === "success" ||
          row.validation_status === "valid";
        const has_governance = !!row.governance_folder_item_id;
        byTenant.set(row.tenant_id, {
          tenant_id: row.tenant_id,
          has_shared,
          has_governance,
          fully_provisioned: has_shared && has_governance,
        });
      }
      return byTenant;
    },
  });
}
