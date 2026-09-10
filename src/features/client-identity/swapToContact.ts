import { supabase } from "@/integrations/supabase/client";

/**
 * Move one tenant membership into the contact projection.
 *
 * The RPC owns the transactional tenant_users -> tenant_contacts transition,
 * including the documented ghost-profile/FK handling. Keep this boundary
 * React-free so the page owns only confirmation and UI state.
 */
export async function swapTenantUserToContact(tenantId: number, userId: string): Promise<void> {
  const { error } = await supabase.rpc("swap_tenant_user_to_contact", {
    p_tenant_id: tenantId,
    p_user_id: userId,
  });
  if (error) throw error;
}
