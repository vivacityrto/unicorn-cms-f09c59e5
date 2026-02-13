/**
 * ExecutiveDashboard – Unicorn 2.0
 *
 * Visionary–Integrator alignment view.
 * Answers: Where are we exposed? Is execution moving? Who needs support?
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
import { ConsultantDistributionTable } from '@/components/executive/ConsultantDistributionTable';
import { StrategicExposureTable } from '@/components/executive/StrategicExposureTable';
import { SystemHealthBlock } from '@/components/executive/SystemHealthBlock';
import { ClientHealthDrawer } from '@/components/executive/ClientHealthDrawer';
import { ExecutiveFiltersBar } from '@/components/executive/ExecutiveFiltersBar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, Users, ShieldAlert } from 'lucide-react';

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
  const [weeklyMode, setWeeklyMode] = useState(false);
  const [showConsultants, setShowConsultants] = useState(false);

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

  const hasFilters = filters.search || filters.riskBands.length > 0 || filters.packageType ||
    filters.staleOnly || filters.criticalOnly || filters.ownerUuid;

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Visionary &amp; Integrator Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Strategic alignment and operational health.
            </p>
          </div>
          <div className="flex items-center gap-4">
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
            <Button
              variant={showConsultants ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => setShowConsultants(!showConsultants)}
            >
              <Users className="w-3.5 h-3.5" />
              By Consultant
            </Button>
          </div>
        </div>

        {/* 1. Strategic Health Snapshot */}
        <StrategicHealthSnapshot data={rawData} weeklyMode={weeklyMode} />

        {/* 2. Alignment Signals + Execution Momentum */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <AlignmentSignalsPanel signals={alignmentSignals ?? []} isLoading={alignmentLoading} weeklyMode={weeklyMode} />
          </div>
          <div className="space-y-6">
            <ExecutionMomentumPanel data={momentum} systemHealth={execSystemHealth} isLoading={momentumLoading} weeklyMode={weeklyMode} />
            <SystemHealthBlock data={rawData} />
          </div>
        </div>

        {/* 3. Consultant Distribution (toggle) */}
        {showConsultants && (
          <ConsultantDistributionTable data={consultants ?? []} isLoading={consultantsLoading} />
        )}

        {/* 4. Sticky Filter Bar */}
        <div className="sticky top-0 z-10">
          <ExecutiveFiltersBar
            filters={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            packageTypes={packageTypes}
          />
        </div>

        {/* 5. Strategic Exposure Table */}
        <StrategicExposureTable data={data} onRowClick={handleSelect} weeklyMode={weeklyMode} />

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
