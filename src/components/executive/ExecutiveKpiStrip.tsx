/**
 * ExecutiveKpiStrip – Unicorn 2.0
 *
 * Four KPI tiles with 7-day trend deltas and confidence.
 */

import { StatCard } from '@/components/ui/stat-card';
import { BarChart3, AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import type { DeltaConfidence } from '@/hooks/useExecutiveHealth';

interface KpiStripProps {
  avgScore: number;
  avgScoreDelta: number;
  avgScoreConfidence: DeltaConfidence;
  atRiskCount: number;
  criticalRisks: number;
  staleCount: number;
}

export function ExecutiveKpiStrip({ avgScore, avgScoreDelta, avgScoreConfidence, atRiskCount, criticalRisks, staleCount }: KpiStripProps) {
  const showTrend = avgScoreDelta !== 0 && avgScoreConfidence !== 'none';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Average Compliance Score"
        value={`${avgScore}%`}
        icon={BarChart3}
        intent="default"
        trend={showTrend ? { value: Math.abs(avgScoreDelta), positive: avgScoreDelta > 0 } : undefined}
      />
      <StatCard
        label="Clients At Risk"
        value={atRiskCount}
        icon={AlertTriangle}
        intent={atRiskCount > 0 ? 'warning' : 'success'}
      />
      <StatCard
        label="Active Critical Risks"
        value={criticalRisks}
        icon={ShieldAlert}
        intent={criticalRisks > 0 ? 'danger' : 'success'}
      />
      <StatCard
        label="Stale Clients (>14d)"
        value={staleCount}
        icon={Clock}
        intent={staleCount > 0 ? 'warning' : 'success'}
      />
    </div>
  );
}
