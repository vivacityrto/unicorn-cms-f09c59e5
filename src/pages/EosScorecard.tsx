import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Hand,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useScorecardMetrics } from '@/hooks/useScorecardMetrics';
import { useRBAC } from '@/hooks/useRBAC';
import { NeedsAttention } from '@/components/eos/scorecard2/NeedsAttention';
import { CompanyScorecardTable } from '@/components/eos/scorecard2/CompanyScorecardTable';
import { MissingDataPanel } from '@/components/eos/scorecard2/MissingDataPanel';
import { MetricDetailDrawer } from '@/components/eos/scorecard2/MetricDetailDrawer';
import { MetricEditorDialogV2 } from '@/components/eos/scorecard2/MetricEditorDialogV2';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import type { ScorecardMetric } from '@/types/scorecard';

export default function EosScorecard() {
  return (
    <DashboardLayout>
      <ScorecardDashboard />
    </DashboardLayout>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  variant,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  variant: 'green' | 'red' | 'amber' | 'default' | 'muted';
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-500/10 text-green-700 dark:text-green-400',
    red: 'bg-destructive/10 text-destructive',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    default: 'bg-primary/10 text-primary',
    muted: 'bg-muted text-muted-foreground',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg p-3 gap-1 text-center min-w-[90px]', colors[variant])}>
      <Icon className="h-4 w-4 opacity-80 mb-0.5" />
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-xs opacity-80 leading-tight">{label}</span>
    </div>
  );
}

function ScorecardDashboard() {
  const [showArchived, setShowArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<ScorecardMetric | null>(null);
  const [detailMetric, setDetailMetric] = useState<ScorecardMetric | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { canEditVTO } = useRBAC();
  const {
    metrics,
    isLoading,
    createMetric,
    updateMetric,
    archiveMetric,
    deleteMetric,
    recordEntry,
  } = useScorecardMetrics(showArchived);

  const lastRefreshed = format(new Date(), 'h:mm a');

  const summary = useMemo(() => {
    const active = metrics.filter((m) => !m.is_archived && m.is_active);
    return {
      onTrack: active.filter((m) => m.latestStatus === 'green').length,
      offTrack: active.filter((m) => m.latestStatus === 'red').length,
      atRisk: active.filter((m) => m.latestStatus === 'amber').length,
      noData: active.filter((m) => m.latestStatus === 'no_data').length,
      automatic: active.filter((m) => m.metric_source === 'automatic').length,
      manual: active.filter((m) => m.metric_source === 'manual').length,
      total: active.length,
    };
  }, [metrics]);

  const existingNames = metrics.map((m) => m.name);

  const handleEdit = (m: ScorecardMetric) => {
    setEditingMetric(m);
    setEditorOpen(true);
  };

  const handleViewHistory = (m: ScorecardMetric) => {
    setDetailMetric(m);
    setDetailOpen(true);
  };

  const handleRecord = (
    metric: ScorecardMetric,
    value: number,
    notes?: string,
    weekEnding?: string,
  ) => {
    recordEntry.mutate({ metric, value, notes, weekEnding: weekEnding! });
  };

  const handleMissingRecord = (m: ScorecardMetric) => {
    // Open detail drawer which allows inline entry
    setDetailMetric(m);
    setDetailOpen(true);
  };

  const handleSave = (payload: Partial<ScorecardMetric> & { id?: string }) => {
    if (payload.id) {
      updateMetric.mutate(
        { id: payload.id, ...payload },
        { onSuccess: () => { setEditorOpen(false); setEditingMetric(null); } },
      );
    } else {
      createMetric.mutate(payload, {
        onSuccess: () => { setEditorOpen(false); },
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // In production this triggers the automation edge function
    // For now, just re-query
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Loading scorecard…</p>
        </div>
      </div>
    );
  }

  const activeMetrics = metrics.filter((m) => !m.is_archived && m.is_active);
  const showMetricWarning = activeMetrics.length > 15;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scorecard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Weekly EOS health — one owner, one measurable, one target
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived" className="text-sm text-muted-foreground cursor-pointer">
              Show archived
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
          {!showArchived && (
            <PermissionTooltip permission="vto:edit" action="add scorecard metrics">
              <Button
                size="sm"
                onClick={() => { setEditingMetric(null); setEditorOpen(true); }}
                disabled={!canEditVTO()}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add Metric
              </Button>
            </PermissionTooltip>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="flex flex-wrap gap-2">
        <SummaryCard label="On Track" value={summary.onTrack} icon={CheckCircle2} variant="green" />
        <SummaryCard label="Off Track" value={summary.offTrack} icon={XCircle} variant="red" />
        <SummaryCard label="At Risk" value={summary.atRisk} icon={AlertCircle} variant="amber" />
        <SummaryCard label="No Data" value={summary.noData} icon={AlertCircle} variant="muted" />
        <div className="flex-1 min-w-[60px]" />
        <SummaryCard label="Automated" value={summary.automatic} icon={Zap} variant="default" />
        <SummaryCard label="Manual" value={summary.manual} icon={Hand} variant="muted" />
        <div className="hidden sm:flex flex-col items-center justify-center text-xs text-muted-foreground px-3">
          <span className="font-medium">Refreshed</span>
          <span>{lastRefreshed}</span>
        </div>
      </div>

      {/* Metric count warning */}
      {showMetricWarning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          EOS scorecards work best with fewer than 15 active metrics. You currently have {activeMetrics.length}.
        </div>
      )}

      {/* Empty State */}
      {metrics.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border-2 border-dashed border-border">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold mb-2">No scorecard metrics yet</h3>
          <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">
            Add your first metric to start tracking your EOS scorecard. Use a template to get started quickly.
          </p>
          {!showArchived && (
            <PermissionTooltip permission="vto:edit" action="add scorecard metrics">
              <Button
                onClick={() => { setEditingMetric(null); setEditorOpen(true); }}
                disabled={!canEditVTO()}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Your First Metric
              </Button>
            </PermissionTooltip>
          )}
        </div>
      )}

      {/* Section 1: Needs Attention */}
      {activeMetrics.length > 0 && (
        <NeedsAttention metrics={activeMetrics} onViewHistory={handleViewHistory} />
      )}

      {/* Section 2: Company Scorecard */}
      {activeMetrics.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold flex items-center gap-2">
            Company Scorecard
            <Badge variant="secondary" className="text-xs">{activeMetrics.length} metrics</Badge>
          </h2>
          <CompanyScorecardTable
            metrics={activeMetrics}
            onEdit={handleEdit}
            onArchive={(id) => archiveMetric.mutate(id)}
            onDelete={(id) => deleteMetric.mutate(id)}
            onRecord={handleRecord}
            onViewHistory={handleViewHistory}
            isArchiving={archiveMetric.isPending}
            isDeleting={deleteMetric.isPending}
          />
        </section>
      )}

      {/* Show archived metrics */}
      {showArchived && metrics.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-muted-foreground">Archived Metrics</h2>
          <CompanyScorecardTable
            metrics={metrics}
            onEdit={handleEdit}
            onArchive={(id) => archiveMetric.mutate(id)}
            onDelete={(id) => deleteMetric.mutate(id)}
            onRecord={handleRecord}
            onViewHistory={handleViewHistory}
            isArchiving={archiveMetric.isPending}
            isDeleting={deleteMetric.isPending}
          />
        </section>
      )}

      {/* Section 3: Missing Data */}
      {activeMetrics.length > 0 && (
        <MissingDataPanel metrics={activeMetrics} onRecord={handleMissingRecord} />
      )}

      {/* Metric Detail Drawer */}
      <MetricDetailDrawer
        metric={detailMetric}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(m) => {
          setDetailOpen(false);
          setTimeout(() => handleEdit(m), 100);
        }}
      />

      {/* Metric Editor Dialog */}
      <MetricEditorDialogV2
        open={editorOpen}
        onOpenChange={(v) => {
          setEditorOpen(v);
          if (!v) setEditingMetric(null);
        }}
        metric={editingMetric}
        onSave={handleSave}
        isSaving={createMetric.isPending || updateMetric.isPending}
        existingNames={existingNames}
      />
    </div>
  );
}
