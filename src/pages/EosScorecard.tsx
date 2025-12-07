import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useEosScorecardMetrics } from '@/hooks/useEos';
import { ScorecardEntryGrid } from '@/components/eos/ScorecardEntryGrid';
import { MetricEditorDialog } from '@/components/eos/MetricEditorDialog';
import { DashboardLayout } from '@/components/DashboardLayout';

export default function EosScorecard() {
  return (
    <DashboardLayout>
      <ScorecardContent />
    </DashboardLayout>
  );
}

function ScorecardContent() {
  const { metrics, isLoading } = useEosScorecardMetrics();
  const [isEditorOpen, setIsEditorOpen] = useState(false);

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
        <Button onClick={() => setIsEditorOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Metric
        </Button>
      </div>

      {metrics && metrics.length > 0 ? (
        <div className="space-y-4">
          {metrics.map((metric) => (
            <ScorecardEntryGrid key={metric.id} metric={metric} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold mb-2">No Metrics Yet</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-md">
              Add your first metric to start tracking your scorecard
            </p>
            <Button onClick={() => setIsEditorOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Metric
            </Button>
          </CardContent>
        </Card>
      )}

      <MetricEditorDialog 
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
      />
    </div>
  );
}

