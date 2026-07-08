import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type TenantLiveness = {
  tenant_id: number;
  has_shared: boolean;
  has_governance: boolean;
  shared_live: boolean | null;
  governance_live: boolean | null;
  fully_live: boolean;
  error: string | null;
};

/**
 * Live per-tenant SharePoint verification.
 *
 * DB flags (has_shared / has_governance) match the worker's provisioning
 * predicate. shared_live / governance_live are Graph GETs against the
 * recorded drive/item ids — null means "not checked" (no drive_id yet).
 *
 * Concurrency is capped inside the edge function (see
 * check-tenant-sharepoint-liveness). Cap of 200 tenants per call.
 */
export function useTenantSharepointLiveness(tenantIds: number[]) {
  const key = tenantIds.length ? [...tenantIds].sort((a, b) => a - b) : [];
  return useQuery({
    queryKey: ["bulk-generate", "tenant-sp-liveness", key],
    enabled: key.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<number, TenantLiveness>> => {
      const { data, error } = await supabase.functions.invoke(
        "check-tenant-sharepoint-liveness",
        { body: { tenant_ids: key } },
      );
      if (error) {
        let details = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            details = await error.context.text();
          } catch {
            /* ignore */
          }
        }
        throw new Error(details);
      }
      const rows = ((data as { results?: TenantLiveness[] })?.results ?? []);
      const map = new Map<number, TenantLiveness>();
      for (const r of rows) map.set(r.tenant_id, r);
      return map;
    },
  });
}
