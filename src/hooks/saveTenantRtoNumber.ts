import { supabase } from "@/integrations/supabase/client";

/**
 * Saves a tenant's RTO number. The caller owns input validation and UI state;
 * this adapter preserves the existing update payload and error contract.
 */
export async function saveTenantRtoNumber(tenantId: number, rtoNumber: string): Promise<void> {
  const { error } = await supabase
    .from("tenants")
    .update({ rto_id: rtoNumber, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (error) throw error;
}
