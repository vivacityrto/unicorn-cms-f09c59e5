import { ShieldAlert, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useClientProgress } from "@/hooks/useClientProgress";
import { useClientActivityTimeline } from "@/hooks/useClientActivityTimeline";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { differenceInDays } from "date-fns";

export function CompliancePulseBanner() {
  const { activeTenantId } = useClientTenant();
  const { data: progressList } = useClientProgress(activeTenantId);
  const { data: timeline = [] } = useClientActivityTimeline();

  if (!progressList || progressList.length === 0) return null;

  // Aggregate risk
  const worstRisk = progressList.some((p) => p.risk_state === "action_required")
    ? "action_required"
    : progressList.some((p) => p.risk_state === "needs_attention")
    ? "needs_attention"
    : "on_track";

  // Current phase
  const currentPhase = progressList[0]?.current_phase_name ?? "—";

  // Submission eligible = all on_track
  const submissionEligible = progressList.every((p) => p.risk_state === "on_track");

  // Days since last activity
  const lastActivityDate = timeline[0]?.created_at ? new Date(timeline[0].created_at) : null;
  const daysSinceActivity = lastActivityDate
    ? differenceInDays(new Date(), lastActivityDate)
    : null;

  const bgClass =
    worstRisk === "action_required"
      ? "bg-destructive/10 border-destructive/30"
      : worstRisk === "needs_attention"
      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
      : "bg-primary/5 border-primary/20";

  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm ${bgClass}`}>
      {/* Risk level */}
      <div className="flex items-center gap-1.5">
        {worstRisk === "action_required" ? (
          <ShieldAlert className="h-4 w-4 text-destructive" />
        ) : worstRisk === "needs_attention" ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        )}
        <span className="font-medium text-foreground">
          {worstRisk === "action_required"
            ? "Action Required"
            : worstRisk === "needs_attention"
            ? "Needs Attention"
            : "On Track"}
        </span>
      </div>

      {/* Phase position */}
      <div className="text-muted-foreground">
        Phase: <span className="font-medium text-foreground">{currentPhase}</span>
      </div>

      {/* Submission */}
      <div className="text-muted-foreground">
        Submission:{" "}
        {submissionEligible ? (
          <Badge variant="outline" className="text-primary text-xs">Eligible</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">Not yet</Badge>
        )}
      </div>

      {/* Days since activity */}
      {daysSinceActivity !== null && (
        <div className="flex items-center gap-1 text-muted-foreground ml-auto">
          <Activity className="h-3.5 w-3.5" />
          {daysSinceActivity === 0
            ? "Active today"
            : `${daysSinceActivity}d since last activity`}
        </div>
      )}
    </div>
  );
}
