import { supabase } from "@/integrations/supabase/client";

/**
 * Loads the tenant's head-office transfer date. The caller owns state updates;
 * this adapter preserves the existing filters, null fallback, and intentionally
 * ignored query-error behavior.
 */
export async function fetchTenantHeadOfficeTransferDate(tenantId: number): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_addresses")
    .select("transfer_date")
    .eq("tenant_id", tenantId)
    .eq("address_type", "HO")
    .maybeSingle();

  return data?.transfer_date ?? null;
}
