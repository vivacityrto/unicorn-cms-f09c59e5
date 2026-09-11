import { supabase } from "@/integrations/supabase/client";

export interface TgaLinkSyncStatus {
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

/**
 * Loads the current TGA link sync status for a tenant/RTO pair. The caller
 * owns state updates; this adapter preserves the existing null fallback and
 * intentionally ignored query-error behavior.
 */
export async function fetchTgaLinkSyncStatus(
  tenantId: number,
  rtoNumber: string
): Promise<TgaLinkSyncStatus | null> {
  const { data } = await supabase
    .from("tga_links")
    .select("last_sync_at, last_sync_status, last_sync_error")
    .eq("tenant_id", tenantId)
    .eq("rto_number", rtoNumber)
    .maybeSingle();

  return data ?? null;
}
