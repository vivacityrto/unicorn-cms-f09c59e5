import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Shield, Eye, EyeOff, TrendingUp, FileWarning, Activity, CheckCircle2 } from 'lucide-react';
import type { ReviewSummary } from '@/hooks/useReviewMode';

interface ReviewModePanelProps {
  reviewMode: boolean;
  onToggle: () => void;
  summary: ReviewSummary | undefined;
  loading: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-600 bg-red-500/10 border-red-500/30',
  high: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
  moderate: 'text-blue-600 bg-blue-500/10 border-blue-500/30',
};

export function ReviewModePanel({ reviewMode, onToggle, summary, loading }: ReviewModePanelProps) {
  return (
    <div className="space-y-4">
      {/* Toggle bar */}
      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${reviewMode ? 'bg-primary/10' : 'bg-muted'}`}>
            {reviewMode ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div>
            <p className="text-sm font-medium">Review Mode</p>
            <p className="text-xs text-muted-foreground">
              {reviewMode ? 'Showing flagged issues only' : 'Toggle to focus on risks and gaps'}
            </p>
          </div>
        </div>
        <Switch checked={reviewMode} onCheckedChange={onToggle} />
      </div>

      {/* Review Summary Panel */}
      {reviewMode && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              Review Summary
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : summary ? (
              <>
                {/* Top Risk Drivers */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <AlertTriangle className="h-3 w-3" />
                    Top Risk Drivers
                  </div>
                  {summary.topRiskDrivers.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.topRiskDrivers.map((risk, i) => (
                        <div key={i} className={`flex items-start gap-2 p-2 rounded-md border text-xs ${SEVERITY_COLORS[risk.severity] || SEVERITY_COLORS.moderate}`}>
                          <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{risk.clause}</Badge>
                          <span className="line-clamp-2">{risk.reason}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      No high-severity risks
                    </p>
                  )}
                </div>

                <Separator />

                {/* Clause Cluster Summary */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <TrendingUp className="h-3 w-3" />
                    Clause Clusters
                  </div>
                  <p className="text-xs">{summary.clauseClusterSummary}</p>
                </div>

                <Separator />

                {/* Evidence Gap Count */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <FileWarning className="h-3 w-3" />
                    Evidence Gaps
                  </div>
                  <Badge variant={summary.evidenceGapCount > 0 ? 'destructive' : 'secondary'} className="text-xs">
                    {summary.evidenceGapCount}
                  </Badge>
                </div>

                <Separator />

                {/* Stage Health Summary */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <Activity className="h-3 w-3" />
                    Stage Health
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: 'critical', label: 'Critical', color: 'text-red-600' },
                      { key: 'at_risk', label: 'At Risk', color: 'text-amber-600' },
                      { key: 'monitoring', label: 'Monitoring', color: 'text-blue-600' },
                      { key: 'healthy', label: 'Healthy', color: 'text-green-600' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className="text-center">
                        <p className={`text-lg font-bold ${color}`}>
                          {summary.stageHealthSummary[key as keyof typeof summary.stageHealthSummary]}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
