import { AlertTriangle, Info, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RockStatusSignal, RockWorkSummary } from '@/utils/rockWork';

interface RockWorkStripProps {
  work: RockWorkSummary;
  signals: readonly RockStatusSignal[];
  /** Whoever may change the Rock's status may take the offered action. Others only read. */
  canChangeStatus: boolean;
  actionPending?: boolean;
  onMarkComplete?: () => void;
}

/**
 * The Rock's linked To-Dos as one figure (the Rock's own and its milestones'), with a line for
 * each place the status someone set disagrees with them. Reads only; the status stays a person's call.
 */
export function RockWorkStrip({ work, signals, canChangeStatus, actionPending, onMarkComplete }: RockWorkStripProps) {
  if (work.total === 0 && signals.length === 0) return null;
  return (
    <section aria-label="Rock work" className="space-y-2 rounded-lg border bg-muted/20 p-3">
      {work.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
              To-Dos
              <span className="font-normal tabular-nums text-muted-foreground">{work.done} of {work.total} done</span>
            </span>
            {work.overdue > 0 && (
              <Badge variant="outline" className="border-transparent bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {work.overdue} overdue
              </Badge>
            )}
          </div>
          <div
            role="progressbar"
            aria-label="To-Dos done"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={work.percent ?? 0}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-green-500" style={{ width: `${work.percent ?? 0}%` }} />
          </div>
        </div>
      )}
      {signals.length > 0 && (
        <ul className="space-y-1.5">
          {signals.map(signal => (
            <li
              key={signal.id}
              className={cn(
                'flex flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-xs',
                signal.tone === 'warn'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                  : 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200',
              )}
            >
              <span className="flex min-w-0 items-start gap-2">
                {signal.tone === 'warn'
                  ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <span className="break-words">{signal.text}</span>
              </span>
              {signal.action === 'mark_complete' && canChangeStatus && onMarkComplete && (
                <Button type="button" size="sm" className="h-7 shrink-0 text-xs" disabled={actionPending} onClick={onMarkComplete}>
                  Mark Rock Complete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
