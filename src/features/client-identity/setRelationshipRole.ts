import { supabase } from "@/integrations/supabase/client";
import {
  legacyTenantUserPatch,
  type RelationshipRole,
} from "@/lib/roles/relationshipRole";

/**
 * Apply one tenant user's canonical relationship role through the
 * transactional RPC and return the legacy fields needed by the caller's
 * in-memory projection.
 *
 * The RPC remains the only write boundary for tenant membership role state;
 * this React-free seam only preserves the existing payload and error
 * propagation from TenantUsersTab.
 */
export async function setTenantUserRelationshipRole(
  tenantId: number,
  userId: string,
  relationshipRole: RelationshipRole,
): Promise<ReturnType<typeof legacyTenantUserPatch>> {
  const { error } = await supabase.rpc("set_relationship_role", {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_relationship_role: relationshipRole,
    p_reason: null,
  });
  if (error) throw error;

  return legacyTenantUserPatch(relationshipRole);
}
