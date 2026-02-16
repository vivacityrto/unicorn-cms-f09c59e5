/**
 * WorkflowOptimisation – Unicorn 2.0 Phase 16
 * Internal page showing bottlenecks, imbalances, and rework clusters.
 */
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useActiveWorkflowSignals, useResolveWorkflowSignal } from '@/hooks/useWorkflowOptimisation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert, AlertTriangle, CheckCircle, Zap, Users, RefreshCcw, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const severityConfig: Record<string, { color: string }> = {
  low: { color: 'bg-blue-100 text-blue-800' },
  moderate: { color: 'bg-yellow-100 text-yellow-800' },
  high: { color: 'bg-red-100 text-red-800' },
};

const typeConfig: Record<string, { label: string; icon: any }> = {
  bottleneck_detected: { label: 'Bottleneck', icon: Pause },
  sequencing_issue: { label: 'Sequencing', icon: Zap },
  workload_imbalance: { label: 'Imbalance', icon: Users },
  repeated_rework: { label: 'Rework', icon: RefreshCcw },
  stalled_stage: { label: 'Stalled', icon: Pause },
  inefficient_task_distribution: { label: 'Distribution', icon: Zap },
};

export default function WorkflowOptimisation() {
  const { isSuperAdmin } = useRBAC();
  const navigate = useNavigate();
  const { data: signals, isLoading } = useActiveWorkflowSignals();
  const resolveSignal = useResolveWorkflowSignal();

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Workflow Optimisation is available to authorised roles only.</p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  const bottlenecks = (signals ?? []).filter(s => s.signal_type === 'bottleneck_detected' || s.signal_type === 'stalled_stage');
  const imbalances = (signals ?? []).filter(s => s.signal_type === 'workload_imbalance');
  const rework = (signals ?? []).filter(s => s.signal_type === 'repeated_rework');

  const handleResolve = async (id: string) => {
    try {
      await resolveSignal.mutateAsync(id);
      toast({ title: 'Signal resolved' });
    } catch {
      toast({ title: 'Failed to resolve', variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-2xl mx-auto">
        <div>
          <h1 className="text-lg font-bold text-foreground">Workflow Optimisation</h1>
          <p className="text-xs text-muted-foreground">
            Operational efficiency signals — all actions require manual confirmation
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Bottlenecks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Active Bottlenecks ({bottlenecks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {bottlenecks.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active bottlenecks detected.</p>
                )}
                {bottlenecks.map(s => (
                  <SignalCard key={s.id} signal={s} onResolve={handleResolve} />
                ))}
              </CardContent>
            </Card>

            {/* Workload Imbalance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Workload Imbalance ({imbalances.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {imbalances.length === 0 && (
                  <p className="text-xs text-muted-foreground">No imbalance signals.</p>
                )}
                {imbalances.map(s => (
                  <SignalCard key={s.id} signal={s} onResolve={handleResolve} />
                ))}
              </CardContent>
            </Card>

            {/* Rework Clusters */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 text-orange-500" />
                  Rework Clusters ({rework.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {rework.length === 0 && (
                  <p className="text-xs text-muted-foreground">No rework patterns detected.</p>
                )}
                {rework.map(s => (
                  <SignalCard key={s.id} signal={s} onResolve={handleResolve} />
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SignalCard({ signal, onResolve }: { signal: any; onResolve: (id: string) => void }) {
  const sev = severityConfig[signal.signal_severity] ?? severityConfig.low;
  const typeCfg = typeConfig[signal.signal_type] ?? { label: signal.signal_type, icon: Zap };
  const Icon = typeCfg.icon;
  const actions = (signal.suggested_action_json ?? []) as string[];

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-snug">{signal.signal_summary}</p>
        </div>
        <Badge className={cn('text-[9px] shrink-0', sev.color)}>
          {signal.signal_severity}
        </Badge>
      </div>

      {actions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground">Suggested</p>
          {actions.map((a: string, i: number) => (
            <p key={i} className="text-[10px] text-muted-foreground">• {a}</p>
          ))}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] w-full"
        onClick={() => onResolve(signal.id)}
      >
        <CheckCircle className="h-3 w-3 mr-1" /> Mark Resolved
      </Button>
    </div>
  );
}
