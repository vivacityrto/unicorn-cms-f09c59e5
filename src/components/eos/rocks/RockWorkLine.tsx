import { AlertTriangle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { RockStatusSignal, RockWorkSummary } from '@/utils/rockWork';

interface RockWorkLineProps {
  work: RockWorkSummary;
  signals?: readonly RockStatusSignal[];
  /** `card` for the Rock cards, `slide` for the Discuss slide (larger type for the room). */
  size?: 'card' | 'slide';
  className?: string;
}

/**
 * A Rock's linked To-Dos as one line (done of total, overdue, a thin bar), with a line under it
 * for each place the status someone set disagrees with them. Reads only: no button, no change.
 * The Rock details panel has its own, fuller strip with the Mark Complete action.
 */
export function RockWorkLine({ work, signals = [], size = 'card', className }: RockWorkLineProps) {
  if (work.total === 0 && signals.length === 0) return null;
  const slide = size === 'slide';
  return (
    <div className={cn('space-y-1', className)} aria-label="To-Dos">
      {work.total > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={cn(slide ? 'text-base font-semibold text-foreground' : 'text-muted-foreground')}>To-Dos</span>
            <span className="flex items-center gap-2">
              {work.overdue > 0 && (
                <Badge variant="outline" className="border-transparent bg-red-100 px-1.5 py-0 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {work.overdue} overdue
                </Badge>
              )}
              <span className="font-medium tabular-nums">{work.done}/{work.total}</span>
            </span>
          </div>
          <Progress value={work.percent ?? 0} className="h-2" aria-label="To-Dos done" />
        </div>
      )}
      {signals.map(signal => (
        <p
          key={signal.id}
          className={cn(
            'flex items-start gap-1.5',
            slide ? 'text-sm' : 'text-xs',
            signal.tone === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-sky-800 dark:text-sky-300',
          )}
        >
          {signal.tone === 'warn'
            ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className="min-w-0 break-words">{signal.text}</span>
        </p>
      ))}
    </div>
  );
}
