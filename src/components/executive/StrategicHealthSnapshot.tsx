/**
 * StrategicHealthSnapshot – Unicorn 2.0
 *
 * 6 compact tiles: Immediate, At Risk, Stalled, Avg Compliance, Predictive Trend, Data Coverage.
 * Conditional border highlights per brand palette.
 */

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import type { SystemHealthData } from '@/hooks/useExecutiveData';
import { formatDistanceToNow } from 'date-fns';

interface StrategicHealthSnapshotProps {
  data: ExecutiveHealthRow[];
  weeklyMode: boolean;
  systemHealth?: SystemHealthData[];
}

function DeltaIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-[11px] text-muted-foreground">No change</span>;
  const isUp = value > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
      isUp ? 'text-[hsl(333,86%,51%)]' : 'text-[hsl(275,55%,41%)]'
    )}>
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{value}{suffix}
    </span>
  );
}

function ComplianceDeltaIndicator({ value }: { value: number }) {
  if (value === 0) return <span className="text-[11px] text-muted-foreground">No change</span>;
  // For compliance: up = good (purple), down = bad (fuchsia) — inverted from risk
  const isUp = value > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
      isUp ? 'text-[hsl(275,55%,41%)]' : 'text-[hsl(333,86%,51%)]'
    )}>
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{value}
    </span>
  );
}

export function StrategicHealthSnapshot({ data, weeklyMode, systemHealth }: StrategicHealthSnapshotProps) {
  const hasAnySnapshot = data.some(r => r.compliance_calculated_at != null);

  const stats = useMemo(() => {
    const immediateCount = data.filter(r => r.risk_band === 'immediate_attention').length;
    const immediateDelta = data.filter(r => r.risk_band === 'immediate_attention' && r.risk_band_change_7d === 'changed').length;

    const atRiskCount = data.filter(r => r.risk_band === 'at_risk').length;
    const atRiskDelta = data.filter(r => r.risk_band === 'at_risk' && r.risk_band_change_7d === 'changed').length;

    const stalledCount = data.filter(r => r.days_stale > 14).length;
    const stalledIncreased = data.filter(r => r.days_stale > 14 && r.delta_days_stale_7d > 0).length;

    const avgScore = data.length > 0 ? Math.round(data.reduce((s, r) => s + r.overall_score, 0) / data.length) : 0;
    const avgScoreDelta = data.length > 0 ? Math.round(data.reduce((s, r) => s + r.delta_overall_score_7d, 0) / data.length) : 0;

    const avgPredDelta = data.length > 0 ? Math.round(data.reduce((s, r) => s + r.delta_operational_risk_7d, 0) / data.length) : 0;
    const bandShiftCount = data.filter(r => r.risk_band_change_7d === 'changed').length;

    // Data coverage from system health
    let coveragePct = 0;
    let updatedAgo = '';
    if (systemHealth && systemHealth.length > 0) {
      coveragePct = Math.round(systemHealth.reduce((s, sh) => s + Number(sh.compliance_coverage_pct ?? 0), 0) / systemHealth.length);
      const latestAt = systemHealth.map(s => s.latest_compliance_snapshot_at).filter(Boolean).sort().reverse()[0];
      updatedAgo = latestAt ? formatDistanceToNow(new Date(latestAt), { addSuffix: false }) : 'never';
    } else {
      // Fallback to rawData coverage
      const withSnapshot = data.filter(r => r.compliance_calculated_at != null).length;
      coveragePct = data.length > 0 ? Math.round((withSnapshot / data.length) * 100) : 0;
      updatedAgo = 'unknown';
    }

    return {
      immediateCount, immediateDelta,
      atRiskCount, atRiskDelta,
      stalledCount, stalledIncreased,
      avgScore, avgScoreDelta,
      avgPredDelta, bandShiftCount,
      coveragePct, updatedAgo,
    };
  }, [data, systemHealth]);

  const tiles = [
    {
      label: 'Immediate Attention',
      value: stats.immediateCount,
      delta: stats.immediateDelta,
      highlight: stats.immediateCount > 0,
      highlightColor: 'ring-[hsl(333,86%,51%)]/30 border-[hsl(333,86%,51%)]',
      borderColor: 'border-l-[hsl(333,86%,51%)]',
    },
    {
      label: 'At Risk',
      value: stats.atRiskCount,
      delta: stats.atRiskDelta,
      highlight: false,
      highlightColor: '',
      borderColor: 'border-l-[hsl(48,96%,52%)]',
    },
    {
      label: 'Stalled >14d',
      value: stats.stalledCount,
      delta: stats.stalledIncreased,
      highlight: stats.stalledIncreased > 0,
      highlightColor: 'ring-[hsl(190,74%,50%)]/30 border-[hsl(190,74%,50%)]',
      borderColor: 'border-l-[hsl(190,74%,50%)]',
    },
    {
      label: 'Avg Compliance',
      value: `${stats.avgScore}%`,
      deltaNode: <ComplianceDeltaIndicator value={stats.avgScoreDelta} />,
      highlight: false,
      highlightColor: '',
      borderColor: 'border-l-[hsl(275,55%,41%)]',
    },
    {
      label: 'Predictive Trend',
      value: stats.avgPredDelta === 0 ? 'Stable' : stats.avgPredDelta > 0 ? 'Rising' : 'Falling',
      deltaNode: stats.bandShiftCount > 0
        ? <span className="text-[11px] text-muted-foreground">{stats.bandShiftCount} band shift{stats.bandShiftCount !== 1 ? 's' : ''}</span>
        : <span className="text-[11px] text-muted-foreground">No shifts</span>,
      highlight: false,
      highlightColor: '',
      borderColor: 'border-l-[hsl(275,55%,41%)]',
    },
    {
      label: 'Data Coverage',
      value: `${stats.coveragePct}%`,
      deltaNode: <span className="text-[11px] text-muted-foreground">{stats.updatedAgo === 'never' ? 'No data' : `${stats.updatedAgo} ago`}</span>,
      highlight: false,
      highlightColor: '',
      borderColor: 'border-l-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
      {tiles.map((tile, i) => (
        <Card key={i} className={cn(
          'bg-card border-l-4',
          tile.borderColor,
          tile.highlight && `ring-1 ${tile.highlightColor}`
        )}>
          <CardContent className="p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{tile.label}</p>
            {!hasAnySnapshot ? (
              <p className="text-xs text-muted-foreground mt-1 italic">No baseline</p>
            ) : (
              <>
                <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums leading-tight">
                  {tile.value}
                </p>
                <div className="mt-0.5">
                  {'deltaNode' in tile && tile.deltaNode ? tile.deltaNode : <DeltaIndicator value={tile.delta ?? 0} />}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
