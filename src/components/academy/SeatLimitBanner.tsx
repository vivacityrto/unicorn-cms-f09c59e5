import { useSeatLimits } from "@/hooks/useSeatLimits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowUpRight, Users } from "lucide-react";

interface SeatLimitBannerProps {
  tenantId: number;
  onUpgradeClick?: () => void;
}

/**
 * Banner that appears when seat limit is reached or near limit
 */
export function SeatLimitBanner({ tenantId, onUpgradeClick }: SeatLimitBannerProps) {
  const { isAtLimit, remainingSeats, maxUsers, currentUsers, nextPlanName, loading } = useSeatLimits({ tenantId });

  // Don't show if loading or not at/near limit
  if (loading) return null;

  const isNearLimit = remainingSeats !== null && remainingSeats > 0 && remainingSeats <= 2;

  if (!isAtLimit && !isNearLimit) return null;

  return (
    <Alert variant={isAtLimit ? "destructive" : "default"} className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Users className="h-4 w-4" />
        {isAtLimit ? "Seat Limit Reached" : "Approaching Seat Limit"}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between mt-2">
        <span>
          {isAtLimit
            ? `You've used all ${maxUsers} seats. Upgrade your plan to invite more team members.`
            : `You have ${remainingSeats} seat${remainingSeats === 1 ? "" : "s"} remaining (${currentUsers}/${maxUsers} used).`}
        </span>
        {nextPlanName && (
          <Button
            variant={isAtLimit ? "secondary" : "outline"}
            size="sm"
            onClick={onUpgradeClick}
            className="ml-4 shrink-0"
          >
            Upgrade to {nextPlanName}
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
