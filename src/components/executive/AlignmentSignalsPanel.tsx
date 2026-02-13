/**
 * AlignmentSignalsPanel – Unicorn 2.0
 *
 * "Where We Must Talk" — structured meeting surface.
 * Powered by v_exec_alignment_signals_7d backend view.
 * Capped at 8 highest-priority items.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';
import type { AlignmentSignal } from '@/hooks/useAlignmentSignals';

interface AlignmentSignalsPanelProps {
  signals: AlignmentSignal[];
  isLoading: boolean;
  weeklyMode: boolean;
}

const severityStyles: Record<string, string> = {
  critical: 'bg-[hsl(333,86%,93%)] text-[hsl(333,86%,35%)] dark:bg-[hsl(333,86%,15%)] dark:text-[hsl(333,86%,70%)]',
  warning: 'bg-[hsl(38,100%,90%)] text-[hsl(38,80%,30%)] dark:bg-[hsl(38,80%,15%)] dark:text-[hsl(38,100%,70%)]',
  info: 'bg-[hsl(186,72%,90%)] text-[hsl(186,72%,25%)] dark:bg-[hsl(186,72%,15%)] dark:text-[hsl(186,72%,70%)]',
};

export function AlignmentSignalsPanel({ signals, isLoading, weeklyMode }: AlignmentSignalsPanelProps) {
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let items = signals;

    if (weeklyMode) {
      // Hide phase_completed
      items = items.filter(s => s.signal_type !== 'phase_completed');
      // Show only critical/warning
      items = items.filter(s => s.severity === 'critical' || s.severity === 'warning');

      // Hide consult_spike unless it's the only activity signal
      const nonSpikeItems = items.filter(s => s.signal_type !== 'consult_spike');
      if (nonSpikeItems.length > 0) {
        items = nonSpikeItems;
      }
    }

    return items.slice(0, 6);
  }, [signals, weeklyMode]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Where We Must Talk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading signals…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Where We Must Talk
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {filtered.length > 0
            ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''} requiring discussion`
            : 'No items requiring discussion this week'}
        </p>
      </CardHeader>
      {filtered.length > 0 && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Signal</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Severity</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Owner</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Suggested Discussion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.source_key}
                    className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => navigate(s.deep_link_href)}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[160px] truncate">
                      {s.client_name ?? `Tenant ${s.tenant_id}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-foreground text-xs font-medium">{s.title}</div>
                      {s.detail && (
                        <div className="text-muted-foreground text-[11px] mt-0.5 truncate max-w-[200px]">{s.detail}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge className={cn('text-[10px] capitalize font-medium', severityStyles[s.severity])}>
                        {s.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs truncate max-w-[120px]">
                      {s.owner_name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px]">
                      {s.suggested_discussion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
