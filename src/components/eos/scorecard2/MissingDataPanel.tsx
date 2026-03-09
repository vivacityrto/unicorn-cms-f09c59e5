import { format, startOfWeek } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ScorecardMetric } from '@/types/scorecard';
import { useTenantUsers } from '@/hooks/useTenantUsers';

interface MissingDataPanelProps {
  metrics: ScorecardMetric[];
  onRecord: (m: ScorecardMetric) => void;
}

export function MissingDataPanel({ metrics, onRecord }: MissingDataPanelProps) {
  const { getUserName } = useTenantUsers();
  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const missing = metrics.filter(
    (m) =>
      !m.is_archived &&
      m.is_active &&
      m.metric_source !== 'automatic' &&
      !m.recentEntries?.some((e) => e.week_ending === thisWeek),
  );

  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/5 border-b border-amber-500/20">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">Missing Updates This Week</span>
        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs">{missing.length}</Badge>
      </div>

      <div className="divide-y divide-border/50">
        {missing.map((m) => {
          const ownerName = m.owner_id ? getUserName(m.owner_id) : null;
          return (
            <button
              key={m.id}
              onClick={() => onRecord(m)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-500/5 transition-colors text-left gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{m.name}</span>
                <Badge variant="outline" className="text-xs px-1.5 py-0 flex-shrink-0">{m.category}</Badge>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                {ownerName && <span>{ownerName}</span>}
                <span className="text-primary font-medium">+ Record →</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
