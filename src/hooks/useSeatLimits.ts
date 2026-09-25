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
  tenantId: number,
  academySolo = false,
): Promise<{ canInvite: boolean; currentUsers: number; maxUsers: number | null; message?: string }> {
  try {
    // Get tenant info including type and max users
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("tenant_type, academy_max_users, metadata")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return { canInvite: false, currentUsers: 0, maxUsers: null, message: "Tenant not found" };
    }

    const tenantType = tenant.tenant_type as TenantType;
    // Vivacity Academy tenants (Solo/Team/Elite) always have academy_max_users
    // explicitly set by manage_academy_solo_access/create_academy_solo_account
    // (1 / 10 / null-for-unlimited respectively) — trust it as-is. A `?? 1`
    // fallback here would wrongly cap an Elite (unlimited) tenant at 1 seat,
    // since null legitimately means unlimited for that tier.
    const maxUsers = academySolo
      ? tenant.academy_max_users
      : (tenant.academy_max_users ?? SEAT_LIMITS[tenantType]);

    // Count active members AND outstanding invitations — an invite that
    // hasn't been accepted yet still occupies a seat once sent. Counting
    // only active members let a Solo/Team tenant's single outstanding
    // invite go unnoticed, allowing staff to send a second invite past the
    // seat cap before either had been accepted.
    const [{ count: activeCount, error: activeError }, { count: pendingCount, error: pendingError }] =
      await Promise.all([
        supabase
          .from("tenant_members")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
        supabase
          .from("user_invitations")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);

    if (activeError || pendingError) {
      return { canInvite: false, currentUsers: 0, maxUsers, message: "Failed to count users" };
    }

    const currentUsers = (activeCount || 0) + (pendingCount || 0);

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
