import { useBillingSignals, BillingStatus } from "@/hooks/useBillingSignals";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, Clock, XCircle } from "lucide-react";

interface BillingStatusBannerProps {
  tenantId: number;
  onContactSupport?: () => void;
}

const STATUS_CONFIG: Record<BillingStatus, {
  icon: React.ElementType;
  title: string;
  description: string;
  variant: "default" | "destructive";
  showAction: boolean;
} | null> = {
  trial: {
    icon: Clock,
    title: "Trial Period",
    description: "You're currently on a free trial. Upgrade to continue using all features.",
    variant: "default",
    showAction: true,
  },
  active: null, // No banner for active status
  overdue: {
    icon: AlertTriangle,
    title: "Payment Overdue",
    description: "Your payment is overdue. Please update your payment method to avoid service interruption.",
    variant: "destructive",
    showAction: true,
  },
  suspended: {
    icon: XCircle,
    title: "Account Suspended",
    description: "Your account has been suspended due to non-payment. Please contact support to restore access.",
    variant: "destructive",
    showAction: true,
  },
  cancelled: {
    icon: XCircle,
    title: "Account Cancelled",
    description: "Your subscription has been cancelled. Contact support to reactivate.",
    variant: "destructive",
    showAction: true,
  },
};

/**
 * Banner that displays billing status warnings
 */
export function BillingStatusBanner({ tenantId, onContactSupport }: BillingStatusBannerProps) {
  const { billingStatus, loading } = useBillingSignals({ tenantId });

  if (loading) return null;

  const config = STATUS_CONFIG[billingStatus];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <Alert variant={config.variant} className="mb-4">
      <Icon className="h-4 w-4" />
      <AlertTitle>{config.title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between mt-2">
        <span>{config.description}</span>
        {config.showAction && (
          <Button
            variant={config.variant === "destructive" ? "secondary" : "outline"}
            size="sm"
            onClick={onContactSupport}
            className="ml-4 shrink-0"
          >
            <CreditCard className="h-4 w-4 mr-1" />
            {billingStatus === "suspended" || billingStatus === "cancelled" 
              ? "Contact Support" 
              : "Update Payment"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
