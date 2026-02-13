/**
 * ExecutiveDashboard – Unicorn 2.0
 *
 * Internal-only view: Compliance + Predictive Risk + 7-Day Deltas + Anomaly Signals.
 */

import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useExecutiveHealth, type ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import { useExecutiveAnomalies } from '@/hooks/useExecutiveAnomalies';
import { ExecutiveKpiStrip } from '@/components/executive/ExecutiveKpiStrip';
import { ClientHealthMatrix } from '@/components/executive/ClientHealthMatrix';
import { PriorityQueueTable } from '@/components/executive/PriorityQueueTable';
import { ClientHealthDrawer } from '@/components/executive/ClientHealthDrawer';
import { ExecutiveFiltersBar } from '@/components/executive/ExecutiveFiltersBar';
import { WatchlistPanel } from '@/components/executive/WatchlistPanel';
import { SignalsPanel } from '@/components/executive/SignalsPanel';
import { Loader2 } from 'lucide-react';

export default function ExecutiveDashboard() {
  const { data, rawData, watchlist, isLoading, kpis, filters, updateFilter, resetFilters } = useExecutiveHealth();
  const { data: anomalies } = useExecutiveAnomalies();
  const [selectedRow, setSelectedRow] = useState<ExecutiveHealthRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSelect = (row: ExecutiveHealthRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const packageTypes = useMemo(() => {
    const types = new Set(rawData.map(r => r.package_type).filter(Boolean) as string[]);
    return Array.from(types).sort();
  }, [rawData]);

  // Filter anomalies for selected row
  const selectedAnomalies = useMemo(() => {
    if (!selectedRow || !anomalies) return [];
    return anomalies.filter(
      a => a.tenant_id === selectedRow.tenant_id && a.package_instance_id === selectedRow.package_instance_id
    );
  }, [selectedRow, anomalies]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6 max-w-screen-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compliance health and operational risk across all active packages.
          </p>
        </div>

        <ExecutiveKpiStrip
          avgScore={kpis.avgScore}
          avgScoreDelta={kpis.avgScoreDelta}
          avgScoreConfidence={kpis.avgScoreConfidence}
          atRiskCount={kpis.atRiskCount}
          criticalRisks={kpis.criticalRisks}
          staleCount={kpis.staleCount}
        />

        <ExecutiveFiltersBar
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          packageTypes={packageTypes}
        />

        {/* Signals + Watchlist */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SignalsPanel anomalies={anomalies ?? []} />
          <WatchlistPanel watchlist={watchlist} healthData={rawData} onItemClick={handleSelect} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ClientHealthMatrix data={data} onSelect={handleSelect} />
          <PriorityQueueTable data={data} onRowClick={handleSelect} />
        </div>

        <ClientHealthDrawer
          row={selectedRow}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          anomalies={selectedAnomalies}
        />
      </div>
    </DashboardLayout>
  );
}
