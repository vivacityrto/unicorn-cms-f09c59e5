import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logUpgradeAttempt, UpgradeTriggerType } from "@/hooks/useBillingSignals";
import { PLAN_NAMES, UPGRADE_PATHS } from "@/hooks/useSeatLimits";
import type { TenantType } from "@/contexts/TenantTypeContext";
import { ArrowRight, Users, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  currentPlan: TenantType;
  triggerType: UpgradeTriggerType;
  triggerContext?: string; // e.g., "seat_limit" or "feature:documents"
}

// Plan benefits for display
const PLAN_BENEFITS: Record<TenantType, string[]> = {
  academy_solo: ["1 user", "All courses", "Certificates"],
  academy_team: ["Up to 10 users", "All courses", "Certificates", "Team progress tracking"],
  academy_elite: ["Up to 30 users", "All courses", "Certificates", "Team progress tracking", "Priority support"],
  compliance_system: [
    "Unlimited users",
    "Full compliance system",
    "Document management",
    "Resource Hub access",
    "Vivacity Consultant",
    "Academy access included",
  ],
};

export function UpgradeModal({
  open,
  onOpenChange,
  tenantId,
  currentPlan,
  triggerType,
  triggerContext,
}: UpgradeModalProps) {
  const navigate = useNavigate();
  const [isRequesting, setIsRequesting] = useState(false);

  const nextPlan = UPGRADE_PATHS[currentPlan];
  const currentPlanName = PLAN_NAMES[currentPlan];
  const nextPlanName = nextPlan ? PLAN_NAMES[nextPlan] : null;
  const nextPlanBenefits = nextPlan ? PLAN_BENEFITS[nextPlan] : [];

  // Check if this is a compliance tenant - they should never see self-service billing
  const isComplianceTenant = currentPlan === "compliance_system";
  const isVerticalUpgrade = currentPlan.startsWith("academy_") && nextPlan === "compliance_system";

  const handleRequestUpgrade = async () => {
    // Block any self-service actions for compliance tenants
    if (isComplianceTenant) {
      toast.error("Billing is managed by Vivacity", {
        description: "Please contact your Vivacity consultant for billing changes.",
      });
      onOpenChange(false);
      return;
    }

    setIsRequesting(true);

    // Log the upgrade attempt
    await logUpgradeAttempt({
      tenantId,
      fromPlan: currentPlan,
      toPlan: nextPlan || "unknown",
      triggerType,
      outcome: "blocked", // User requested but needs manual processing
      metadata: { triggerContext },
    });

    // For vertical upgrades to compliance, redirect to contact sales
    if (isVerticalUpgrade) {
      toast.success("Upgrade request submitted", {
        description: "Our team will contact you shortly to discuss upgrading to the Compliance System.",
      });
    } else {
      toast.success("Upgrade request submitted", {
        description: "Your upgrade request has been submitted. You'll receive a confirmation email shortly.",
      });
    }

    setIsRequesting(false);
    onOpenChange(false);
  };

  const handleCancel = async () => {
    // Log cancelled upgrade attempt
    await logUpgradeAttempt({
      tenantId,
      fromPlan: currentPlan,
      toPlan: nextPlan || "unknown",
      triggerType,
      outcome: "cancelled",
      metadata: { triggerContext },
    });
    
    onOpenChange(false);
  };

  // Compliance tenants should never see this modal - they have no upgrade path
  // and billing is managed externally
  if (!nextPlan || isComplianceTenant) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Upgrade Your Plan
          </DialogTitle>
          <DialogDescription>
            {triggerType === "seat_limit_reached" ? (
              <>You've reached your seat limit. Upgrade to invite more team members.</>
            ) : triggerType === "feature_access_attempt" ? (
              <>This feature requires a higher plan. Upgrade to unlock it.</>
            ) : (
              <>Unlock more features and capacity by upgrading your plan.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Current vs Next Plan */}
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <Badge variant="outline" className="mb-2">Current</Badge>
              <p className="font-medium">{currentPlanName}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-center">
              <Badge className="mb-2">Recommended</Badge>
              <p className="font-medium text-primary">{nextPlanName}</p>
            </div>
          </div>

          {/* Benefits List */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="font-medium text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              What you'll get with {nextPlanName}:
            </p>
            <ul className="space-y-2">
              {nextPlanBenefits.map((benefit, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          {/* Vertical upgrade notice */}
          {isVerticalUpgrade && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 text-sm">
              <p className="font-medium text-primary">Upgrading to Compliance System</p>
              <p className="text-muted-foreground mt-1">
                This is a significant upgrade. Our team will contact you to discuss your requirements
                and set up your Compliance System subscription.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Not now
          </Button>
          <Button onClick={handleRequestUpgrade} disabled={isRequesting}>
            {isRequesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Requesting...
              </>
            ) : isVerticalUpgrade ? (
              "Contact Sales"
            ) : (
              "Request Upgrade"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
