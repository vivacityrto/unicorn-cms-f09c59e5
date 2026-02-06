import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TenantType } from "@/contexts/TenantTypeContext";
import { SEAT_LIMITS, PLAN_NAMES, UPGRADE_PATHS } from "./useSeatLimits";

// Billing status type
export type BillingStatus = "trial" | "active" | "overdue" | "suspended" | "cancelled";

// Upgrade trigger types for audit logging
export type UpgradeTriggerType = 
  | "manual_admin"
  | "manual_sales"
  | "manual_superadmin"
  | "seat_limit_reached"
  | "feature_access_attempt";

// Billing signals interface
export interface BillingSignals {
  // Seat usage
  currentUsers: number;
  maxUsers: number | null;
  pendingInvites: number;
  
  // Feature access
  academyAccessEnabled: boolean;
  complianceSystemEnabled: boolean;
  resourceHubEnabled: boolean;
  documentsEnabled: boolean;
  
  // Consumption
  coursesEnrolledCount: number;
  certificatesIssuedCount: number;
  documentDownloadsCount: number;
  
  // Lifecycle
  tenantType: TenantType | null;
  planCode: string | null;
  planStartedAt: string | null;
  billingStatus: BillingStatus;
  
  // Computed
  isReadOnly: boolean;
  canInvite: boolean;
  isAtSeatLimit: boolean;
  planName: string;
  nextPlan: TenantType | null;
  nextPlanName: string | null;
}

interface UseBillingSignalsState extends BillingSignals {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface UseBillingSignalsOptions {
  tenantId?: number;
}

/**
 * Hook to access billing signals for a tenant
 */
export function useBillingSignals(options: UseBillingSignalsOptions = {}): UseBillingSignalsState {
  const [signals, setSignals] = useState<BillingSignals>({
    currentUsers: 0,
    maxUsers: null,
    pendingInvites: 0,
    academyAccessEnabled: false,
    complianceSystemEnabled: true,
    resourceHubEnabled: true,
    documentsEnabled: true,
    coursesEnrolledCount: 0,
    certificatesIssuedCount: 0,
    documentDownloadsCount: 0,
    tenantType: null,
    planCode: null,
    planStartedAt: null,
    billingStatus: "active",
    isReadOnly: false,
    canInvite: true,
    isAtSeatLimit: false,
    planName: "Unknown",
    nextPlan: null,
    nextPlanName: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBillingSignals = useCallback(async (tenantId?: number) => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch tenant billing data
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select(`
          id,
          tenant_type,
          plan_code,
          plan_started_at,
          billing_status,
          academy_max_users,
          academy_access_enabled,
          compliance_system_enabled,
          resource_hub_enabled,
          documents_enabled,
          courses_enrolled_count,
          certificates_issued_count,
          document_downloads_count
        `)
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant) {
        setError("Failed to fetch tenant data");
        return;
      }

      // Count active users
      const { count: userCount, error: userCountError } = await supabase
        .from("tenant_members")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active");

      if (userCountError) {
        console.error("Error counting users:", userCountError);
      }

      // Pending invites count - set to 0 as invitations table may not exist yet
      const inviteCount = 0;

      const tenantType = (tenant.tenant_type as TenantType) || "compliance_system";
      const maxUsers = tenant.academy_max_users ?? SEAT_LIMITS[tenantType];
      const currentUsers = userCount || 0;
      const billingStatus = (tenant.billing_status as BillingStatus) || "active";
      
      // Compute derived values
      const isReadOnly = billingStatus === "suspended" || billingStatus === "overdue";
      const isAtSeatLimit = maxUsers !== null && currentUsers >= maxUsers;
      const canInvite = !isReadOnly && (maxUsers === null || currentUsers < maxUsers);
      const planName = PLAN_NAMES[tenantType];
      const nextPlan = UPGRADE_PATHS[tenantType];
      const nextPlanName = nextPlan ? PLAN_NAMES[nextPlan] : null;

      setSignals({
        currentUsers,
        maxUsers,
        pendingInvites: inviteCount || 0,
        academyAccessEnabled: tenant.academy_access_enabled ?? false,
        complianceSystemEnabled: tenant.compliance_system_enabled ?? true,
        resourceHubEnabled: tenant.resource_hub_enabled ?? true,
        documentsEnabled: tenant.documents_enabled ?? true,
        coursesEnrolledCount: tenant.courses_enrolled_count ?? 0,
        certificatesIssuedCount: tenant.certificates_issued_count ?? 0,
        documentDownloadsCount: tenant.document_downloads_count ?? 0,
        tenantType,
        planCode: tenant.plan_code,
        planStartedAt: tenant.plan_started_at,
        billingStatus,
        isReadOnly,
        canInvite,
        isAtSeatLimit,
        planName,
        nextPlan,
        nextPlanName,
      });
    } catch (err) {
      console.error("Error fetching billing signals:", err);
      setError("Failed to fetch billing signals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.tenantId) {
      fetchBillingSignals(options.tenantId);
    } else {
      setLoading(false);
    }
  }, [options.tenantId, fetchBillingSignals]);

  const refresh = useCallback(async () => {
    if (options.tenantId) {
      await fetchBillingSignals(options.tenantId);
    }
  }, [options.tenantId, fetchBillingSignals]);

  return {
    ...signals,
    loading,
    error,
    refresh,
  };
}

/**
 * Log an upgrade attempt to the audit table
 */
export async function logUpgradeAttempt({
  tenantId,
  fromPlan,
  toPlan,
  triggerType,
  outcome,
  failureReason,
  metadata,
}: {
  tenantId: number;
  fromPlan: string;
  toPlan: string;
  triggerType: UpgradeTriggerType;
  outcome: "success" | "blocked" | "failed" | "cancelled";
  failureReason?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("No authenticated user for upgrade attempt log");
      return false;
    }

    // Direct insert - cast to avoid type issues with newly created table
    const { error } = await supabase
      .from("audit_upgrade_attempts" as never)
      .insert({
        actor_user_id: user.id,
        tenant_id: tenantId,
        from_plan: fromPlan,
        to_plan: toPlan,
        trigger_type: triggerType,
        outcome,
        failure_reason: failureReason || null,
        metadata: metadata || {},
      } as never);

    if (error) {
      console.error("Error logging upgrade attempt:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error logging upgrade attempt:", err);
    return false;
  }
}

/**
 * Check feature access for a tenant
 */
export async function checkFeatureAccess(
  tenantId: number,
  feature: "academy" | "compliance" | "resource_hub" | "documents"
): Promise<{ allowed: boolean; reason?: string; upgradeRequired?: boolean }> {
  try {
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select(`
        tenant_type,
        billing_status,
        academy_access_enabled,
        compliance_system_enabled,
        resource_hub_enabled,
        documents_enabled
      `)
      .eq("id", tenantId)
      .single();

    if (error || !tenant) {
      return { allowed: false, reason: "Tenant not found" };
    }

    // Check billing status first
    const billingStatus = tenant.billing_status as BillingStatus;
    if (billingStatus === "suspended") {
      return { allowed: false, reason: "Account suspended. Please contact support." };
    }

    // Check feature-specific access
    const featureMap: Record<string, boolean> = {
      academy: tenant.academy_access_enabled ?? false,
      compliance: tenant.compliance_system_enabled ?? false,
      resource_hub: tenant.resource_hub_enabled ?? false,
      documents: tenant.documents_enabled ?? false,
    };

    if (!featureMap[feature]) {
      const tenantType = tenant.tenant_type as TenantType;
      const isAcademy = tenantType?.startsWith("academy_");
      
      return {
        allowed: false,
        reason: isAcademy 
          ? `This feature requires a Compliance System subscription.`
          : `This feature is not enabled for your plan.`,
        upgradeRequired: isAcademy,
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("Error checking feature access:", err);
    return { allowed: false, reason: "Error checking access" };
  }
}
