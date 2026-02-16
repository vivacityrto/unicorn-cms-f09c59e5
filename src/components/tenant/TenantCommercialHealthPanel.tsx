/**
 * TenantCommercialHealthPanel – Unicorn 2.0 Phase 15
 * Displays retention risk index, status, trend, key drivers, and CSC actions.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, DollarSign } from 'lucide-react';
import { useLatestRetentionForecast, useRetentionTrend } from '@/hooks/useRetentionForecast';
import { cn } from '@/lib/utils';

interface Props {
  tenantId: number;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  stable: { label: 'Stable', color: 'bg-green-100 text-green-800' },
  watch: { label: 'Watch', color: 'bg-yellow-100 text-yellow-800' },
  vulnerable: { label: 'Vulnerable', color: 'bg-orange-100 text-orange-800' },
  high_risk: { label: 'High Risk', color: 'bg-red-100 text-red-800' },
};

export function TenantCommercialHealthPanel({ tenantId }: Props) {
  const { data: forecast, isLoading } = useLatestRetentionForecast(tenantId);
  const { data: trend } = useRetentionTrend(tenantId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Commercial Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No retention forecast available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const cfg = statusConfig[forecast.retention_status] ?? statusConfig.stable;

  // 7-day trend
  const recent = (trend ?? []).slice(-7);
  const trendDelta =
    recent.length >= 2
      ? recent[recent.length - 1].composite_retention_risk_index -
        recent[0].composite_retention_risk_index
      : 0;

  const TrendIcon =
    trendDelta > 5 ? TrendingUp : trendDelta < -5 ? TrendingDown : Minus;

  const isActionable =
    forecast.retention_status === 'vulnerable' ||
    forecast.retention_status === 'high_risk';

  const drivers = (forecast.key_drivers_json ?? []) as string[];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Commercial Health
          </CardTitle>
          <Badge className={cn('text-[10px]', cfg.color)}>{cfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score */}
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold">
            {forecast.composite_retention_risk_index}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendIcon className="h-3 w-3" />
            <span>
              {trendDelta > 0 ? '+' : ''}
              {trendDelta.toFixed(0)} 7d
            </span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Engagement</span>
            <span className="ml-1 font-medium">{forecast.engagement_score}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Utilisation</span>
            <span className="ml-1 font-medium">{forecast.value_utilisation_score}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Pressure</span>
            <span className="ml-1 font-medium">{forecast.service_pressure_score}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Overlap</span>
            <span className="ml-1 font-medium">{forecast.risk_stress_overlap_score}</span>
          </div>
        </div>

        {/* Trend sparkline (simplified) */}
        {recent.length > 1 && (
          <div className="flex items-end gap-[2px] h-8">
            {recent.map((r, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/20 rounded-sm"
                style={{
                  height: `${Math.max(4, (r.composite_retention_risk_index / 100) * 32)}px`,
                }}
              />
            ))}
          </div>
        )}

        {/* Key Drivers */}
        {drivers.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Key Drivers
            </p>
            {drivers.map((d, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                <span>{d}</span>
              </div>
            ))}
          </div>
        )}

        {/* CSC Actions */}
        {isActionable && (
          <div className="pt-2 border-t space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Suggested Actions
            </p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• Schedule strategic check-in call</li>
              <li>• Review perceived value utilisation</li>
              <li>• Review stage momentum</li>
              <li>• Review package usage</li>
              <li>• Prepare renewal strategy</li>
            </ul>
            <Button variant="outline" size="sm" className="w-full text-xs h-7">
              Create Retention Action Plan
            </Button>
          </div>
        )}

        {/* Mandatory disclaimer */}
        <p className="text-[9px] text-muted-foreground/70 italic pt-1">
          This forecast highlights engagement and service patterns only and does
          not predict contractual outcomes.
        </p>
      </CardContent>
    </Card>
  );
}
