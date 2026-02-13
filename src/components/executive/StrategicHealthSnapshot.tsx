/**
 * StrategicHealthSnapshot – Unicorn 2.0
 *
 * Portfolio health status: band counts with 7-day movement.
 * Secondary metrics: Avg Compliance Score + Predictive Risk Trend.
 */

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface StrategicHealthSnapshotProps {
  data: ExecutiveHealthRow[];
  weeklyMode: boolean;
}

interface BandBlock {
  key: string;
  label: string;
  filterFn: (r: ExecutiveHealthRow) => boolean;
  borderColor: string;
}

const BANDS: BandBlock[] = [
  {
    key: 'immediate',
    label: 'Immediate Attention',
    filterFn: r => r.risk_band === 'immediate_attention',
    borderColor: 'border-l-[hsl(333,86%,51%)]',
  },
  {
    key: 'at_risk',
    label: 'At Risk',
    filterFn: r => r.risk_band === 'at_risk',
    borderColor: 'border-l-[hsl(48,96%,52%)]',
  },
  {
    key: 'stable',
    label: 'Stable',
    filterFn: r => r.risk_band === 'stable' || r.risk_band === 'watch',
    borderColor: 'border-l-[hsl(275,55%,41%)]',
  },
  {
    key: 'stalled',
    label: 'Stalled >14d',
    filterFn: r => r.days_stale > 14,
    borderColor: 'border-l-[hsl(190,74%,50%)]',
  },
];

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-muted-foreground">No change</span>;
  const isUp = delta > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs font-medium',
      isUp ? 'text-[hsl(333,86%,51%)]' : 'text-[hsl(275,55%,41%)]'
    )}>
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{delta} this week
    </span>
  );
}

function TrendIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <Minus className="w-3.5 h-3.5 text-muted-foreground inline" />;
  const isUp = value > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
      isUp ? 'text-[hsl(275,55%,41%)]' : 'text-[hsl(333,86%,51%)]'
    )}>
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{value}{suffix}
    </span>
  );
}

export function StrategicHealthSnapshot({ data, weeklyMode }: StrategicHealthSnapshotProps) {
  const hasAnySnapshot = data.some(r => r.compliance_calculated_at != null);

  const counts = useMemo(() => BANDS.map(band => {
    const matching = data.filter(band.filterFn);
    const count = matching.length;

    let delta = 0;
    if (band.key === 'immediate') {
      delta = data.filter(r => r.risk_band === 'immediate_attention' && r.risk_band_change_7d === 'changed').length;
    } else if (band.key === 'at_risk') {
      delta = data.filter(r => r.risk_band === 'at_risk' && r.risk_band_change_7d === 'changed').length;
    } else if (band.key === 'stalled') {
      delta = data.filter(r => r.days_stale > 14 && r.delta_days_stale_7d > 0).length;
    }

    return { ...band, count, delta };
  }), [data]);

  // Secondary metrics
  const avgScore = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.round(data.reduce((s, r) => s + r.overall_score, 0) / data.length);
  }, [data]);

  const avgScoreDelta = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.round(data.reduce((s, r) => s + r.delta_overall_score_7d, 0) / data.length);
  }, [data]);

  const avgPredictiveDelta = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.round(data.reduce((s, r) => s + r.delta_operational_risk_7d, 0) / data.length);
  }, [data]);

  const immediateCount = counts.find(b => b.key === 'immediate')?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counts.map(b => (
          <Card key={b.key} className={cn(
            'bg-card border-l-4',
            b.borderColor,
            b.key === 'immediate' && b.count > 0 && 'ring-1 ring-[hsl(333,86%,51%)]/20'
          )}>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{b.label}</p>
              {!hasAnySnapshot ? (
                <p className="text-sm text-muted-foreground mt-2 italic">Awaiting first calculation</p>
              ) : (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                    {weeklyMode && b.delta !== 0 ? `${b.delta > 0 ? '+' : ''}${b.delta}` : b.count}
                  </p>
                  {!weeklyMode && <DeltaBadge delta={b.delta} />}
                  {weeklyMode && (
                    <p className="text-xs text-muted-foreground mt-0.5">{b.count} total</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary metrics row */}
      {hasAnySnapshot && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg Compliance Score</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{avgScore}%</p>
              </div>
              <TrendIndicator value={avgScoreDelta} />
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Predictive Risk Trend</p>
                <p className="text-xl font-bold text-foreground tabular-nums">
                  {avgPredictiveDelta === 0 ? 'Stable' : avgPredictiveDelta > 0 ? 'Rising' : 'Falling'}
                </p>
              </div>
              <TrendIndicator value={avgPredictiveDelta} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
