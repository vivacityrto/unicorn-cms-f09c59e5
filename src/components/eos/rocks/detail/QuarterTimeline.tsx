import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/rockPanelFormat';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import type { TimelineModel, TimelinePoint } from '@/utils/rockPanelMetrics';

const DOT: Record<TimelinePoint['status'], string> = {
  complete: 'bg-green-500 border-green-600',
  in_progress: 'bg-blue-500 border-blue-600',
  blocked: 'bg-violet-500 border-violet-600',
  off_track: 'bg-orange-500 border-orange-600',
  not_started: 'bg-card border-muted-foreground/60',
  deferred: 'bg-muted border-muted-foreground/30',
};

const LANE_HEIGHT = 16;
const TOP = 22; // room for the month labels

/**
 * Milestone due dates across the quarter, with today marked. Markers that fall
 * close together stack into lanes. It is a picture of pacing; the milestone
 * table below carries the same information as text.
 */
export function QuarterTimeline({ model, summary }: { model: TimelineModel; summary: string }) {
  const clamped = model.points.filter(p => p.clamped).length;
  const height = TOP + model.lanes * LANE_HEIGHT + 6;

  return (
    <div className="space-y-1.5">
      <div role="img" aria-label={summary} className="relative mx-2" style={{ height }}>
        {/* month ticks and labels */}
        {model.months.map(month => (
          <div key={month.label} className="absolute top-0 h-full" style={{ left: `${month.pct}%` }} aria-hidden>
            <div className="h-full border-l border-dashed border-muted-foreground/30" />
            <span className="absolute left-1 top-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {month.label}
            </span>
          </div>
        ))}
        {/* baseline */}
        <div className="absolute inset-x-0 rounded-full bg-muted-foreground/20" style={{ top: TOP - 3, height: 2 }} aria-hidden />

        {model.todayPct !== null && (
          <div className="absolute top-0 h-full" style={{ left: `${model.todayPct}%` }} aria-hidden>
            <div className="h-full w-px bg-primary" />
            <span className="absolute -top-0.5 left-1 rounded bg-primary px-1 text-[9px] font-semibold uppercase leading-4 text-primary-foreground">
              Today
            </span>
          </div>
        )}

        {model.points.map(point => (
          <span
            key={point.id}
            title={`${point.ref} · ${point.label} · due ${formatDate(point.dueDate, 'd MMM')} · ${MILESTONE_STATUS[point.status].label}${point.overdue ? ' · overdue' : ''}`}
            aria-hidden
            className={cn(
              'absolute block h-3 w-3 -translate-x-1/2 rounded-full border-2',
              DOT[point.status],
              point.overdue && 'ring-2 ring-red-500/70 ring-offset-1 ring-offset-card',
            )}
            style={{ left: `${point.pct}%`, top: TOP + point.lane * LANE_HEIGHT - 6 }}
          />
        ))}
      </div>
      {(model.undated > 0 || clamped > 0) && (
        <p className="text-[11px] text-muted-foreground">
          {model.undated > 0 && `${model.undated} without a due date`}
          {model.undated > 0 && clamped > 0 && ' · '}
          {clamped > 0 && `${clamped} due outside this quarter, shown at the edge`}
        </p>
      )}
    </div>
  );
}
