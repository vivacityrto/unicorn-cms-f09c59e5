import { supabase } from "@/integrations/supabase/client";
import { TenantType } from "@/contexts/TenantTypeContext";

// Seat limits by tenant type
export const SEAT_LIMITS: Record<TenantType, number | null> = {
  academy_solo: 1,
  academy_team: 10,
  academy_elite: 30,
  compliance_system: null, // Unlimited
};

// Upgrade paths
export const UPGRADE_PATHS: Record<TenantType, TenantType | null> = {
  academy_solo: "academy_team",
  academy_team: "academy_elite",
  academy_elite: "compliance_system",
  compliance_system: null, // No upgrade available
};

/**
 * Check if a tenant can accept more users
 */
export async function checkSeatAvailability(
  tenantId: number
): Promise<{ canInvite: boolean; currentUsers: number; maxUsers: number | null; message?: string }> {
  try {
    // Get tenant info including type and max users
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("tenant_type, academy_max_users")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return { canInvite: false, currentUsers: 0, maxUsers: null, message: "Tenant not found" };
    }

    const tenantType = tenant.tenant_type as TenantType;
    const maxUsers = tenant.academy_max_users ?? SEAT_LIMITS[tenantType];

    // Count current active members
    const { count, error: countError } = await supabase
      .from("tenant_members")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    if (countError) {
      return { canInvite: false, currentUsers: 0, maxUsers, message: "Failed to count users" };
    }

    const currentUsers = count || 0;

    // Compliance system has no limit
    if (maxUsers === null) {
      return { canInvite: true, currentUsers, maxUsers };
    }

    if (currentUsers >= maxUsers) {
      return {
        canInvite: false,
        currentUsers,
        maxUsers,
        message: `Seat limit reached (${currentUsers}/${maxUsers}). Upgrade your plan to invite more users.`,
      };
    }

    return { canInvite: true, currentUsers, maxUsers };
  } catch (error) {
    console.error("Error checking seat availability:", error);
    return { canInvite: false, currentUsers: 0, maxUsers: null, message: "Error checking availability" };
  }
}
