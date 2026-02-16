import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, AlertTriangle } from 'lucide-react';
import type { LabourMetric } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  metrics: LabourMetric[];
  currentUserId: string | undefined;
}

function StatBlock({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn('text-lg font-bold', alert ? 'text-destructive' : 'text-foreground')}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

export function LabourEfficiencyPanel({ metrics, currentUserId }: Props) {
  const me = metrics.find(m => m.csc_user_id === currentUserId);
  const totalClients = metrics.reduce((s, m) => s + Number(m.client_count), 0);
  const totalOverdue = metrics.reduce((s, m) => s + Number(m.total_overdue_tasks), 0);
  const totalOpen = metrics.reduce((s, m) => s + Number(m.total_open_tasks), 0);
  const avgClients = metrics.length > 0 ? Math.round(totalClients / metrics.length) : 0;
  const overdueRatio = totalOpen > 0 ? Math.round((totalOverdue / totalOpen) * 100) : 0;
  const intensiveTotal = metrics.reduce((s, m) => s + Number(m.intensive_clients), 0);
  const lowTouchTotal = metrics.reduce((s, m) => s + Number(m.low_touch_clients), 0);
  const lowTouchPct = totalClients > 0 ? Math.round((lowTouchTotal / totalClients) * 100) : 0;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Users className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Labour Efficiency</h2>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatBlock label="Avg Clients/CSC" value={avgClients} />
            <StatBlock label="Low-Touch %" value={`${lowTouchPct}%`} />
            <StatBlock label="Intensive Clients" value={intensiveTotal} alert={intensiveTotal > lowTouchTotal} />
            <StatBlock label="Overdue Ratio" value={`${overdueRatio}%`} alert={overdueRatio > 30} />
            <StatBlock label="Total Overdue" value={totalOverdue} alert={totalOverdue > 10} />
          </div>
          {me && Number(me.overdue_ratio_pct) > 40 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Your overdue ratio is {me.overdue_ratio_pct}% — review task priorities</span>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
