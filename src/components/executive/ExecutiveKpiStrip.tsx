/**
 * ExecutiveKpiStrip – Unicorn 2.0
 *
 * Four KPI tiles for the Executive Dashboard.
 */

import { StatCard } from '@/components/ui/stat-card';
import { BarChart3, AlertTriangle, ShieldAlert, Clock } from 'lucide-react';

interface KpiStripProps {
  avgScore: number;
  atRiskCount: number;
  criticalRisks: number;
  staleCount: number;
}

export function ExecutiveKpiStrip({ avgScore, atRiskCount, criticalRisks, staleCount }: KpiStripProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Average Compliance Score"
        value={`${avgScore}%`}
        icon={BarChart3}
        intent="default"
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
