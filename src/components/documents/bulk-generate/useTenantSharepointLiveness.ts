import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type FolderState = "ok" | "missing" | "unconfigured" | "error";

export type TenantLiveness = {
  tenant_id: number;
  shared: FolderState;
  governance: FolderState;
  error: string | null;
};

/**
 * Live per-tenant SharePoint verification.
 *
 * Enum values (`shared`, `governance`) are computed server-side in the
 * check-tenant-sharepoint-liveness edge function — single source of truth
 * for the four-state derivation. The frontend renders directly from them
 * and does NOT combine raw fields.
 *
 * Concurrency and the 200-tenant cap are enforced inside the edge function.
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
