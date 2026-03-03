import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck } from "lucide-react";
import { useClientProgress } from "@/hooks/useClientProgress";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export function AuditReadinessCard() {
  const { activeTenantId } = useClientTenant();
  const { data: progressList } = useClientProgress(activeTenantId);

  if (!progressList || progressList.length === 0) return null;

  // Aggregate across all packages
  const avgCoverage = Math.round(
    progressList.reduce((sum, p) => sum + (p.documentation_coverage ?? 0), 0) / progressList.length
  );
  const totalRemaining = progressList.reduce((sum, p) => sum + (p.steps_remaining ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Audit Readiness</h3>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Documentation coverage</span>
          <span className="font-medium text-foreground">{avgCoverage}%</span>
        </div>
        <Progress value={avgCoverage} className="h-2" />

        {totalRemaining > 0 && (
          <p className="text-xs text-muted-foreground">
            {totalRemaining} step{totalRemaining !== 1 ? "s" : ""} remaining across all packages
          </p>
        )}
      </CardContent>
    </Card>
  );
}
