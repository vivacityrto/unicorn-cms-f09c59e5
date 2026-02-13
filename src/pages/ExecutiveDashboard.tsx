/**
 * ExecutiveDashboard – Unicorn 2.0
 *
 * Visionary–Integrator weekly alignment view.
 * Single-screen layout: Snapshot → Signals + Momentum → Exposure + Owner Pressure → Summary.
 * Weekly Review Mode default ON. No scrolling required at 1440px.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useExecutiveHealth, type ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import { useExecutiveAnomalies } from '@/hooks/useExecutiveAnomalies';
import { useAlignmentSignals } from '@/hooks/useAlignmentSignals';
import { useExecutiveMomentum, useConsultantDistribution, useExecSystemHealth } from '@/hooks/useExecutiveData';
import { StrategicHealthSnapshot } from '@/components/executive/StrategicHealthSnapshot';
import { AlignmentSignalsPanel } from '@/components/executive/AlignmentSignalsPanel';
import { ExecutionMomentumPanel } from '@/components/executive/ExecutionMomentumPanel';
import { OwnerPressureTable } from '@/components/executive/OwnerPressureTable';
import { StrategicExposureTable } from '@/components/executive/StrategicExposureTable';
import { ClientHealthDrawer } from '@/components/executive/ClientHealthDrawer';
import { ExecutiveFiltersBar } from '@/components/executive/ExecutiveFiltersBar';
import { WeeklySummaryFooter } from '@/components/executive/WeeklySummaryFooter';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Eye, ShieldAlert, Search } from 'lucide-react';

export default function ExecutiveDashboard() {
  const { isSuperAdmin } = useRBAC();
  const navigate = useNavigate();

  const { data, rawData, watchlist, isLoading, kpis, filters, updateFilter, resetFilters } = useExecutiveHealth();
  const { data: anomalies } = useExecutiveAnomalies();
  const { data: alignmentSignals, isLoading: alignmentLoading } = useAlignmentSignals();
  const { data: momentum, isLoading: momentumLoading } = useExecutiveMomentum();
  const { data: consultants, isLoading: consultantsLoading } = useConsultantDistribution();
  const { data: execSystemHealth } = useExecSystemHealth();

  const [selectedRow, setSelectedRow] = useState<ExecutiveHealthRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weeklyMode, setWeeklyMode] = useState(true); // Default ON
  const [showAllClients, setShowAllClients] = useState(false);

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The Visionary &amp; Integrator Dashboard is available to Super Admins only.
          </p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleSelect = (row: ExecutiveHealthRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const packageTypes = Array.from(new Set(rawData.map(r => r.package_type).filter(Boolean) as string[])).sort();

  const filteredAnomalies = selectedRow && anomalies
    ? anomalies.filter(a => a.tenant_id === selectedRow.tenant_id && a.package_instance_id === selectedRow.package_instance_id)
    : [];

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
      <div className="space-y-3 p-3 md:p-4 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Visionary &amp; Integrator Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              {weeklyMode ? 'Weekly alignment review' : 'Strategic alignment and operational health'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Minimal search in weekly mode */}
            {weeklyMode && (
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search client..."
                  value={filters.search}
                  onChange={e => updateFilter('search', e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="weekly-mode"
                checked={weeklyMode}
                onCheckedChange={setWeeklyMode}
              />
              <Label htmlFor="weekly-mode" className="text-xs cursor-pointer flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                Weekly Review
              </Label>
            </div>
          </div>
        </div>

        {/* Row 1: Strategic Snapshot — 6 compact tiles */}
        <StrategicHealthSnapshot data={rawData} weeklyMode={weeklyMode} systemHealth={execSystemHealth} />

        {/* Row 2: Alignment Signals (left) + Execution Momentum (right) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2">
            <AlignmentSignalsPanel signals={alignmentSignals ?? []} isLoading={alignmentLoading} weeklyMode={weeklyMode} />
          </div>
          <div>
            <ExecutionMomentumPanel data={momentum} systemHealth={execSystemHealth} isLoading={momentumLoading} weeklyMode={weeklyMode} />
          </div>
        </div>

        {/* Row 3: Exposure (left) + Owner Pressure (right) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2">
            <StrategicExposureTable data={data} onRowClick={handleSelect} weeklyMode={weeklyMode} />
          </div>
          <div>
            <OwnerPressureTable data={consultants ?? []} isLoading={consultantsLoading} />
          </div>
        </div>

        {/* Weekly Summary Footer */}
        <WeeklySummaryFooter data={rawData} />

        {/* Below the fold: Full filter bar + full table when "Show all clients" */}
        {weeklyMode && (
          <div className="flex items-center gap-2 pt-1">
            <Switch
              id="show-all"
              checked={showAllClients}
              onCheckedChange={setShowAllClients}
            />
            <Label htmlFor="show-all" className="text-xs cursor-pointer text-muted-foreground">
              Show all clients
            </Label>
          </div>
        )}

        {(!weeklyMode || showAllClients) && (
          <>
            {!weeklyMode && (
              <div className="sticky top-0 z-10">
                <ExecutiveFiltersBar
                  filters={filters}
                  onFilterChange={updateFilter}
                  onReset={resetFilters}
                  packageTypes={packageTypes}
                />
              </div>
            )}
            {(!weeklyMode || showAllClients) && (
              <StrategicExposureTable data={data} onRowClick={handleSelect} weeklyMode={false} />
            )}
          </>
        )}

        <ClientHealthDrawer
          row={selectedRow}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          anomalies={filteredAnomalies}
        />
      </div>
    </DashboardLayout>
  );
}
