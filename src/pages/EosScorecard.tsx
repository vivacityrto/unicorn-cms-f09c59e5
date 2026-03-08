import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useEosScorecardMetrics } from '@/hooks/useEos';
import { useRBAC } from '@/hooks/useRBAC';
import { ScorecardEntryGrid } from '@/components/eos/ScorecardEntryGrid';
import { MetricEditorDialog } from '@/components/eos/MetricEditorDialog';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import { DashboardLayout } from '@/components/DashboardLayout';
import type { EosScorecardMetric } from '@/types/eos';

export default function EosScorecard() {
  return (
    <DashboardLayout>
      <ScorecardContent />
    </DashboardLayout>
  );
}

function ScorecardContent() {
  const [showArchived, setShowArchived] = useState(false);
  const { metrics, isLoading, archiveMetric, deleteMetric } = useEosScorecardMetrics(showArchived);
  const { canEditVTO } = useRBAC();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<EosScorecardMetric | null>(null);

  const handleEdit = (metric: EosScorecardMetric) => {
    setEditingMetric(metric);
    setIsEditorOpen(true);
  };

  const handleEditorClose = (open: boolean) => {
    setIsEditorOpen(open);
    if (!open) setEditingMetric(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading scorecard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scorecard</h1>
          <p className="text-muted-foreground mt-2">
            Track your most important weekly metrics
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
              Show Archived
            </Label>
          </div>
          {!showArchived && (
            <PermissionTooltip permission="vto:edit" action="add scorecard metrics">
              <Button onClick={() => { setEditingMetric(null); setIsEditorOpen(true); }} disabled={!canEditVTO()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Metric
              </Button>
            </PermissionTooltip>
          )}
        </div>
      </div>

      {metrics && metrics.length > 0 ? (
        <div className="space-y-4">
          {metrics.map((metric) => (
            <ScorecardEntryGrid
              key={metric.id}
              metric={metric}
              onEdit={handleEdit}
              onArchive={(id) => archiveMetric.mutate(id)}
              onDelete={(id) => deleteMetric.mutate(id)}
              isArchiving={archiveMetric.isPending}
              isDeleting={deleteMetric.isPending}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold mb-2">
              {showArchived ? 'No Archived Metrics' : 'No Metrics Yet'}
            </h3>
            <p className="text-muted-foreground mb-4 text-center max-w-md">
              {showArchived
                ? 'No metrics have been archived yet'
                : 'Add your first metric to start tracking your scorecard'}
            </p>
            {!showArchived && (
              <PermissionTooltip permission="vto:edit" action="add scorecard metrics">
                <Button onClick={() => { setEditingMetric(null); setIsEditorOpen(true); }} disabled={!canEditVTO()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Metric
                </Button>
              </PermissionTooltip>
            )}
          </CardContent>
        </Card>
      )}

      <MetricEditorDialog 
        open={isEditorOpen}
        onOpenChange={handleEditorClose}
        metric={editingMetric}
      />
    </div>
  );
}
