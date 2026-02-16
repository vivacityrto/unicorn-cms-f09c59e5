/**
 * ExecutiveDashboard – Unicorn 2.0
 *
 * Visionary–Integrator weekly alignment view.
 * Single-screen layout: Snapshot → Signals + Momentum → Exposure + Owner Pressure → Summary.
 * Weekly Review Mode default ON. No scrolling required at 1440px.
 */

import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuth } from '@/hooks/useAuth';
import { useExecutiveHealth, type ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import { useExecutiveAnomalies } from '@/hooks/useExecutiveAnomalies';
import { useAlignmentSignals, type AlignmentSignal } from '@/hooks/useAlignmentSignals';
import { useExecutiveMomentum, useConsultantDistribution, useExecSystemHealth } from '@/hooks/useExecutiveData';
import { useWeeklyReview, genItemId } from '@/hooks/useWeeklyReview';
import { StrategicHealthSnapshot } from '@/components/executive/StrategicHealthSnapshot';
import { AlignmentSignalsPanel } from '@/components/executive/AlignmentSignalsPanel';
import { ExecutionMomentumPanel } from '@/components/executive/ExecutionMomentumPanel';
import { OwnerPressureTable } from '@/components/executive/OwnerPressureTable';
import { StrategicExposureTable } from '@/components/executive/StrategicExposureTable';
import { ClientHealthDrawer } from '@/components/executive/ClientHealthDrawer';
import { ExecutiveFiltersBar } from '@/components/executive/ExecutiveFiltersBar';
import { WeeklySummaryFooter } from '@/components/executive/WeeklySummaryFooter';
import { WeeklyReviewNotesPanel } from '@/components/executive/WeeklyReviewNotesPanel';
import { CeoDashboardSection } from '@/components/executive/ceo/CeoDashboardSection';
import { RegulatorUpdatesPanel } from '@/components/executive/RegulatorUpdatesPanel';
import { RegulatorActivityWidget } from '@/components/executive/RegulatorActivityWidget';
import { AuditPreparationWidget } from '@/components/executive/AuditPreparationWidget';
import { EvidenceReadinessWidget } from '@/components/executive/EvidenceReadinessWidget';
import { SystemicRiskSignalsWidget } from '@/components/executive/SystemicRiskSignalsWidget';
import { TemplateHealthWidget } from '@/components/executive/TemplateHealthWidget';
import { PortfolioHealthWidget } from '@/components/executive/PortfolioHealthWidget';
import { TeamCapacityWidget } from '@/components/executive/TeamCapacityWidget';
import { KnowledgeGraphWidget } from '@/components/executive/KnowledgeGraphWidget';
import { ClientRiskForecastWidget } from '@/components/executive/ClientRiskForecastWidget';
import { CommercialRiskWidget } from '@/components/executive/CommercialRiskWidget';
import { WorkflowEfficiencyWidget } from '@/components/executive/WorkflowEfficiencyWidget';
import { RiskCommandWidget } from '@/components/executive/RiskCommandWidget';
import { PlaybookActivationWidget } from '@/components/executive/PlaybookActivationWidget';
import { StrategicOrchestrationWidget } from '@/components/executive/StrategicOrchestrationWidget';
import { CopilotPanel } from '@/components/copilot/CopilotPanel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Eye, ShieldAlert, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const VIVACITY_TENANT_UUID = '00000000-0000-0000-0000-000000006372';

export default function ExecutiveDashboard() {
  const { isSuperAdmin } = useRBAC();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data, rawData, watchlist, isLoading, kpis, filters, updateFilter, resetFilters } = useExecutiveHealth();
  const { data: anomalies } = useExecutiveAnomalies();
  const { data: alignmentSignals, isLoading: alignmentLoading } = useAlignmentSignals();
  const { data: momentum, isLoading: momentumLoading } = useExecutiveMomentum();
  const { data: consultants, isLoading: consultantsLoading } = useConsultantDistribution();
  const { data: execSystemHealth } = useExecSystemHealth();

  // Weekly review — use first tenant from data or vivacity default
  const tenantUuid = useMemo(() => {
    // Try to derive from user profile tenant, or use vivacity system tenant
    return VIVACITY_TENANT_UUID;
  }, []);

  const { currentReview, updateReview } = useWeeklyReview(tenantUuid);

  const [selectedRow, setSelectedRow] = useState<ExecutiveHealthRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weeklyMode, setWeeklyMode] = useState(true); // Default ON
  const [showAllClients, setShowAllClients] = useState(false);

  // Momentum label for notes panel
  const momentumLabel = useMemo(() => {
    if (!momentum) return 'unknown';
    const agg = momentum.reduce(
      (acc, r) => ({
        pc: acc.pc + Number(r.phases_completed_7d),
        pcp: acc.pcp + Number(r.phases_completed_prev_7d),
        dg: acc.dg + Number(r.documents_generated_7d),
        dgp: acc.dgp + Number(r.documents_generated_prev_7d),
        rr: acc.rr + Number(r.risks_resolved_7d),
        rrp: acc.rrp + Number(r.risks_resolved_prev_7d),
        de: acc.de + Number(r.document_events_7d),
        dep: acc.dep + Number(r.document_events_prev_7d),
        ch: acc.ch + Number(r.consult_hours_logged_7d),
        chp: acc.chp + Number(r.consult_hours_logged_prev_7d),
      }),
      { pc: 0, pcp: 0, dg: 0, dgp: 0, rr: 0, rrp: 0, de: 0, dep: 0, ch: 0, chp: 0 }
    );
    const metrics = [
      { c: agg.pc, p: agg.pcp },
      { c: agg.dg, p: agg.dgp },
      { c: agg.de, p: agg.dep },
      { c: agg.rr, p: agg.rrp },
      { c: agg.ch, p: agg.chp },
    ];
    const declining = metrics.filter(m => m.c < m.p).length;
    const improving = metrics.filter(m => m.c > m.p).length;
    return declining >= 3 ? 'Momentum down' : improving >= 3 ? 'Momentum up' : 'Momentum flat';
  }, [momentum]);

  // Add signal to weekly notes
  const handleAddSignalToNotes = useCallback(async (signal: AlignmentSignal) => {
    if (!currentReview) {
      toast({ title: 'Review not ready', description: 'Wait for draft to load.', variant: 'destructive' });
      return;
    }
    if (currentReview.status === 'final') {
      toast({ title: 'Review finalised', description: 'Cannot add to a finalised review.', variant: 'destructive' });
      return;
    }
    const existing = (currentReview.discussion_items as any[]) ?? [];
    const alreadyAdded = existing.some((item: any) => item.source_key === signal.source_key);
    if (alreadyAdded) {
      toast({ title: 'Already added', description: 'This signal is already in the notes.' });
      return;
    }
    const newItem = {
      source_key: signal.source_key,
      client_name: signal.client_name,
      title: signal.title,
      detail: signal.detail,
      severity: signal.severity,
      suggested_discussion: signal.suggested_discussion,
      deep_link_href: signal.deep_link_href,
    };
    try {
      await updateReview({ discussion_items: [...existing, newItem] } as any);
      toast({ title: 'Added to notes', description: signal.title });
    } catch {
      // error handled by mutation
    }
  }, [currentReview, updateReview]);

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
            <AlignmentSignalsPanel
              signals={alignmentSignals ?? []}
              isLoading={alignmentLoading}
              weeklyMode={weeklyMode}
              onAddToNotes={weeklyMode ? handleAddSignalToNotes : undefined}
            />
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

        {/* Regulator Panels */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <RegulatorUpdatesPanel />
          <RegulatorActivityWidget />
        </div>

        {/* Audit Preparation + Evidence Readiness + Systemic Risk + Template Health + Portfolio Health */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <AuditPreparationWidget />
          <EvidenceReadinessWidget />
          <SystemicRiskSignalsWidget />
          <TemplateHealthWidget />
          <PortfolioHealthWidget />
          <KnowledgeGraphWidget />
          <ClientRiskForecastWidget />
          <CommercialRiskWidget />
          <WorkflowEfficiencyWidget />
          <RiskCommandWidget />
          <PlaybookActivationWidget />
          <StrategicOrchestrationWidget />
        </div>

        {/* Team Capacity Overview */}
        <TeamCapacityWidget />

        {/* CEO Executive Dashboard Panels */}
        <CeoDashboardSection />

        {/* Weekly Review Notes Panel — visible in weekly mode */}
        {weeklyMode && (
          <WeeklyReviewNotesPanel
            tenantUuid={tenantUuid}
            rawData={rawData}
            kpis={kpis}
            momentumLabel={momentumLabel}
          />
        )}

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
        <CopilotPanel context={{ context_mode: 'executive' }} />
      </div>
    </DashboardLayout>
  );
}
