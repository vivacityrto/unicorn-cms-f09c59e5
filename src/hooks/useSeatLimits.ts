import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantType, TenantType } from "@/contexts/TenantTypeContext";

// Seat limits by tenant type
export const SEAT_LIMITS: Record<TenantType, number | null> = {
  academy_solo: 1,
  academy_team: 10,
  academy_elite: 30,
  compliance_system: null, // Unlimited
};

// Plan display names
export const PLAN_NAMES: Record<TenantType, string> = {
  academy_solo: "Academy Solo",
  academy_team: "Academy Team",
  academy_elite: "Academy Elite",
  compliance_system: "Compliance System",
};

// Upgrade paths
export const UPGRADE_PATHS: Record<TenantType, TenantType | null> = {
  academy_solo: "academy_team",
  academy_team: "academy_elite",
  academy_elite: "compliance_system",
  compliance_system: null, // No upgrade available
};

interface SeatLimitsState {
  currentUsers: number;
  maxUsers: number | null;
  isAtLimit: boolean;
  isOverLimit: boolean;
  remainingSeats: number | null;
  canInvite: boolean;
  loading: boolean;
  error: string | null;
  planName: string;
  nextPlan: TenantType | null;
  nextPlanName: string | null;
  refresh: () => Promise<void>;
}

interface UseSeatLimitsOptions {
  tenantId?: number;
}

/**
 * Hook to check and enforce seat limits for Academy tenants
 */
export function useSeatLimits(options: UseSeatLimitsOptions = {}): SeatLimitsState {
  const { tenantType, academyMaxUsers } = useTenantType();
  const [currentUsers, setCurrentUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentUserCount = useCallback(async (tenantId?: number) => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Count active members in the tenant
      const { count, error: countError } = await supabase
        .from("tenant_members")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active");

      if (countError) {
        console.error("Error fetching user count:", countError);
        setError("Failed to fetch user count");
        return;
      }

      setCurrentUsers(count || 0);
    } catch (err) {
      console.error("Error in fetchCurrentUserCount:", err);
      setError("Failed to fetch user count");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.tenantId) {
      fetchCurrentUserCount(options.tenantId);
    } else {
      setLoading(false);
    }
  }, [options.tenantId, fetchCurrentUserCount]);

  // Calculate limits based on tenant type
  const maxUsers = academyMaxUsers ?? (tenantType ? SEAT_LIMITS[tenantType] : null);
  const isAtLimit = maxUsers !== null && currentUsers >= maxUsers;
  const isOverLimit = maxUsers !== null && currentUsers > maxUsers;
  const remainingSeats = maxUsers !== null ? Math.max(0, maxUsers - currentUsers) : null;
  const canInvite = maxUsers === null || currentUsers < maxUsers;
  const planName = tenantType ? PLAN_NAMES[tenantType] : "Unknown";
  const nextPlan = tenantType ? UPGRADE_PATHS[tenantType] : null;
  const nextPlanName = nextPlan ? PLAN_NAMES[nextPlan] : null;

  const refresh = useCallback(async () => {
    if (options.tenantId) {
      await fetchCurrentUserCount(options.tenantId);
    }
  }, [options.tenantId, fetchCurrentUserCount]);

  return {
    currentUsers,
    maxUsers,
    isAtLimit,
    isOverLimit,
    remainingSeats,
    canInvite,
    loading,
    error,
    planName,
    nextPlan,
    nextPlanName,
    refresh,
  };
}

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
