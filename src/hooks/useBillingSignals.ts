import { supabase } from "@/integrations/supabase/client";

// Upgrade trigger types for audit logging
export type UpgradeTriggerType =
  | "manual_admin"
  | "manual_sales"
  | "manual_superadmin"
  | "seat_limit_reached"
  | "feature_access_attempt";

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
