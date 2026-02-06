import { useSeatLimits, PLAN_NAMES } from "@/hooks/useSeatLimits";
import { useTenantType } from "@/contexts/TenantTypeContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Crown, ArrowUpRight, AlertTriangle, CheckCircle, Building2, Mail } from "lucide-react";

interface PlanInfoCardProps {
  tenantId: number;
  showUpgradeCTA?: boolean;
  compact?: boolean;
}

export function PlanInfoCard({ tenantId, showUpgradeCTA = true, compact = false }: PlanInfoCardProps) {
  const { tenantType, isAcademyMember } = useTenantType();
  const isComplianceTenant = tenantType === "compliance_system";
  
  const {
    currentUsers,
    maxUsers,
    isAtLimit,
    remainingSeats,
    planName,
    nextPlanName,
    loading,
  } = useSeatLimits({ tenantId });

  if (loading) {
    return (
      <Card className={compact ? "" : "w-full"}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-8 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const usagePercentage = maxUsers ? Math.round((currentUsers / maxUsers) * 100) : 0;
  const isNearLimit = maxUsers && remainingSeats !== null && remainingSeats <= 2 && remainingSeats > 0;

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{planName}</p>
            <p className="text-sm text-muted-foreground">
              {maxUsers ? `${currentUsers} of ${maxUsers} seats used` : "Unlimited seats"}
            </p>
          </div>
        </div>
        {isAtLimit && nextPlanName && showUpgradeCTA && (
          <Button size="sm" variant="outline">
            Upgrade
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              {planName}
            </CardTitle>
            <CardDescription>
              {isAcademyMember
                ? "Vivacity Academy subscription"
                : "Full compliance platform access"}
            </CardDescription>
          </div>
          <Badge variant={isAtLimit ? "destructive" : isNearLimit ? "secondary" : "default"}>
            {isAtLimit ? "At Limit" : isNearLimit ? "Near Limit" : "Active"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Seat Usage */}
        {maxUsers !== null && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                Team Members
              </span>
              <span className="font-medium">
                {currentUsers} / {maxUsers}
              </span>
            </div>
            <Progress value={usagePercentage} className="h-2" />
            <div className="flex items-center gap-2 text-sm">
              {isAtLimit ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">
                    Seat limit reached. Upgrade to invite more users.
                  </span>
                </>
              ) : isNearLimit ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-warning">
                    {remainingSeats} seat{remainingSeats === 1 ? "" : "s"} remaining
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">
                    {remainingSeats} seat{remainingSeats === 1 ? "" : "s"} available
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Unlimited seats message for compliance */}
        {maxUsers === null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span>Unlimited team members included</span>
          </div>
        )}

        {/* Upgrade CTA - Only for Academy tenants (self-service billing) */}
        {showUpgradeCTA && nextPlanName && !isComplianceTenant && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Upgrade to {nextPlanName}</p>
                <p className="text-sm text-muted-foreground">
                  {tenantType === "academy_solo"
                    ? "Invite up to 10 team members"
                    : tenantType === "academy_team"
                    ? "Invite up to 30 team members"
                    : "Unlock full compliance platform access"}
                </p>
              </div>
              <Button>
                Upgrade
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Managed billing notice for Compliance tenants */}
        {isComplianceTenant && (
          <div className="pt-4 border-t">
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-primary" />
                Billing Managed by Vivacity
              </div>
              <p className="text-sm text-muted-foreground">
                Your subscription is managed directly by our team. For billing enquiries, 
                contact your Vivacity consultant.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = "mailto:accounts@vivacitycoaching.com.au?subject=Billing Enquiry"}
              >
                <Mail className="h-4 w-4 mr-2" />
                Contact Accounts
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
