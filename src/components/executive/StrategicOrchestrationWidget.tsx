/**
 * StrategicOrchestrationWidget – Executive Dashboard widget
 * Shows strategic priority counts for the last 30 days.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStrategicPriorityOverview } from "@/hooks/useStrategicOrchestration";
import { Brain, AlertTriangle } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  compliance_cluster: "Compliance Cluster",
  capacity_crisis: "Capacity Crisis",
  regulator_exposure: "Regulator Exposure",
  retention_threat: "Retention Threat",
  systemic_clause_spike: "Systemic Clause Spike",
  operational_breakdown: "Operational Breakdown",
};

export function StrategicOrchestrationWidget() {
  const overview = useStrategicPriorityOverview();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Strategic Orchestration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{overview.totalActive}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </div>
          <div>
            <p className="text-lg font-bold text-destructive">{overview.criticalActive}</p>
            <p className="text-[10px] text-muted-foreground">Critical</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{overview.highActive}</p>
            <p className="text-[10px] text-muted-foreground">High</p>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          {Object.entries(overview.byType).filter(([, v]) => v > 0).map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{TYPE_LABELS[type] || type}</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                {count}
              </Badge>
            </div>
          ))}
          {overview.totalActive === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No active priorities</p>
          )}
        </div>

        <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t">
          <span>30d created: {overview.last30dCreated}</span>
          <span>30d resolved: {overview.last30dResolved}</span>
        </div>
      </CardContent>
    </Card>
  );
}
