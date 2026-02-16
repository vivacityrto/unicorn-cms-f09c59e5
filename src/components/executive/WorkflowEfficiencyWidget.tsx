/**
 * WorkflowEfficiencyWidget – Unicorn 2.0 Phase 16
 * Executive dashboard widget showing workflow efficiency signals.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Zap } from 'lucide-react';
import { useWorkflowOverview } from '@/hooks/useWorkflowOptimisation';

export function WorkflowEfficiencyWidget() {
  const { data, isLoading } = useWorkflowOverview();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Workflow Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No workflow data available.</p>
        </CardContent>
      </Card>
    );
  }

  const metrics = [
    { label: 'Bottlenecks', value: data.active_bottlenecks, warn: data.active_bottlenecks > 3 },
    { label: 'Imbalances', value: data.imbalance_signals, warn: data.imbalance_signals > 0 },
    { label: 'Rework', value: data.rework_signals, warn: data.rework_signals > 2 },
    { label: 'Stalled', value: data.stalled_signals, warn: data.stalled_signals > 2 },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" /> Workflow Efficiency
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className={`text-lg font-bold ${m.warn ? 'text-destructive' : 'text-foreground'}`}>
                {m.value}
              </p>
              <p className="text-[9px] text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="border-t pt-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Unresolved &gt;14d</span>
            <span className={`font-medium ${data.unresolved_14d > 5 ? 'text-destructive' : 'text-foreground'}`}>
              {data.unresolved_14d}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Unresolved</span>
            <span className="font-medium">{data.total_unresolved}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
