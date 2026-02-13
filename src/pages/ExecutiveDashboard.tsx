/**
 * ExecutiveDashboard – Unicorn 2.0
 *
 * Internal-only view combining Compliance Score + Predictive Operational Risk.
 * Route: /executive
 * Access: SuperAdmin, Team Leader, Vivacity Team
 */

import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useExecutiveHealth, type ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import { ExecutiveKpiStrip } from '@/components/executive/ExecutiveKpiStrip';
import { ClientHealthMatrix } from '@/components/executive/ClientHealthMatrix';
import { PriorityQueueTable } from '@/components/executive/PriorityQueueTable';
import { ClientHealthDrawer } from '@/components/executive/ClientHealthDrawer';
import { ExecutiveFiltersBar } from '@/components/executive/ExecutiveFiltersBar';
import { Loader2 } from 'lucide-react';

export default function ExecutiveDashboard() {
  const { data, rawData, isLoading, kpis, filters, updateFilter, resetFilters } = useExecutiveHealth();
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
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compliance health and operational risk across all active packages.
          </p>
        </div>

        {/* KPI Strip */}
        <ExecutiveKpiStrip
          avgScore={kpis.avgScore}
          atRiskCount={kpis.atRiskCount}
          criticalRisks={kpis.criticalRisks}
          staleCount={kpis.staleCount}
        />

        {/* Filters */}
        <ExecutiveFiltersBar
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          packageTypes={packageTypes}
        />

        {/* Health Matrix + Priority Queue */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ClientHealthMatrix data={data} onSelect={handleSelect} />
          <div className="xl:col-span-1">
            <PriorityQueueTable data={data} onRowClick={handleSelect} />
          </div>
        </div>

        {/* Drawer */}
        <ClientHealthDrawer
          row={selectedRow}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    </DashboardLayout>
  );
}
