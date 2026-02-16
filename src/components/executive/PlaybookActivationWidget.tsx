import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePlaybookOverview } from '@/hooks/useCompliancePlaybooks';
import { BookOpen, Loader2, TrendingUp } from 'lucide-react';

const TRIGGER_LABELS: Record<string, string> = {
  clause_cluster: 'Clause Cluster',
  repeated_evidence_gap: 'Evidence Gap',
  regulator_overlap: 'Regulator Overlap',
  stage_stagnation: 'Stage Stagnation',
  high_risk_forecast: 'Risk Forecast',
  none: 'None',
};

export function PlaybookActivationWidget() {
  const { data: overview, isLoading } = usePlaybookOverview();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
          Playbook Activations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Suggested (30d)</p>
                <p className="text-lg font-bold text-foreground">{overview.suggested30d}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Completed (30d)</p>
                <p className="text-lg font-bold text-foreground">{overview.completed30d}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">
                <TrendingUp className="w-3 h-3 mr-1" />
                {overview.initiationRate}% initiated
              </Badge>
              <Badge variant="outline" className="text-xs">
                {overview.completionRate}% completed
              </Badge>
            </div>
            {overview.topTriggerType !== 'none' && (
              <p className="text-xs text-muted-foreground">
                Top trigger: {TRIGGER_LABELS[overview.topTriggerType] || overview.topTriggerType}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No data</p>
        )}
      </CardContent>
    </Card>
  );
}
