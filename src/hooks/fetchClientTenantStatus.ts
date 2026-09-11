import { supabase } from "@/integrations/supabase/client";

export interface ClientTenantStatus {
  status: string;
  mergedInto?: number;
}

/**
 * Loads the tenant status used by the client integrations surface. The caller
 * owns state updates; this adapter preserves the existing query and metadata
 * projection, including its ignored query-error behavior.
 */
export async function fetchClientTenantStatus(tenantId: number): Promise<ClientTenantStatus | null> {
  const { data } = await supabase
    .from("tenants")
    .select("status, metadata")
    .eq("id", tenantId)
    .single();

  if (!data) return null;

  const metadata = data.metadata as Record<string, unknown> | null;
  return {
    status: data.status,
    mergedInto: metadata?.merged_into as number | undefined,
  };
}
