import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getReRegistrationDueDate,
  getReRegistrationUrgency,
  formatReRegistrationLabel,
  type ReRegistrationUrgency,
} from "@/lib/reRegistrationDate";
import { cn } from "@/lib/utils";

interface ReRegistrationBadgeProps {
  tenantId: number;
  /** Bold + larger text for sticky bar usage */
  prominent?: boolean;
  /** Only render when amber or red (hide green) */
  hideGreen?: boolean;
  className?: string;
}

const urgencyColors: Record<ReRegistrationUrgency, string> = {
  red: "text-destructive",
  amber: "text-brand-macaron-600",
  green: "text-emerald-600 dark:text-emerald-400",
};

export function ReRegistrationBadge({
  tenantId,
  prominent = false,
  hideGreen = false,
  className,
}: ReRegistrationBadgeProps) {
  const { data: registrationEndDate } = useQuery({
    queryKey: ["tenant-registration-end", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_profile")
        .select("registration_end_date")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return (data?.registration_end_date as string) ?? null;
    },
    staleTime: 60_000,
  });

  const dueDate = getReRegistrationDueDate(registrationEndDate);
  if (!dueDate) return null;

  const urgency = getReRegistrationUrgency(dueDate);
  if (hideGreen && urgency === "green") return null;

  const label = `RE-REGISTRATION DUE: ${formatReRegistrationLabel(dueDate)}`;

  return (
    <span
      className={cn(
        urgencyColors[urgency],
        prominent ? "text-sm font-bold" : "text-xs font-semibold",
        className,
      )}
    >
      {label}
    </span>
  );
}
