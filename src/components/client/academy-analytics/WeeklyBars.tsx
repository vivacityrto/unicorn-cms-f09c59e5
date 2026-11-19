import { format, parseISO } from 'date-fns';
import type { TenantAcademyLearnerAnalytics } from '@/features/pdp/useTenantAcademyStaffStats';

/** active_learners is left out for one person's own chart. */
type Week = Pick<TenantAcademyLearnerAnalytics['trend'][number], 'week_start' | 'lessons'> & { active_learners?: number };

/**
 * Lessons completed each week as bars drawn to a real scale (the tallest week fills the chart), with how many
 * people were active that week underneath. Plain HTML so the text stays sharp at any width.
 */
export function WeeklyBars({ weeks, compact = false }: { weeks: readonly Week[]; compact?: boolean }) {
  const max = Math.max(1, ...weeks.map((w) => w.lessons));
  const total = weeks.reduce((n, w) => n + w.lessons, 0);
  const summary = `Lessons completed per week over the last ${weeks.length} weeks, ${total} in total.`;
  return (
    <figure className="space-y-2">
      <div className={compact ? "flex h-24 items-end gap-1.5" : "flex h-36 items-end gap-1.5"} role="img" aria-label={summary}>
        {weeks.map((w) => {
          const h = Math.max(w.lessons > 0 ? 6 : 2, Math.round((w.lessons / max) * 100));
          return (
            <div key={w.week_start} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`Week of ${format(parseISO(w.week_start), 'd MMM')}: ${w.lessons} lessons${w.active_learners !== undefined ? `, ${w.active_learners} active` : ''}`}>
              <span className="mb-1 text-center text-[11px] font-medium tabular-nums text-foreground">{w.lessons > 0 ? w.lessons : ''}</span>
              <div className={w.lessons > 0 ? 'rounded-t bg-primary transition-colors group-hover:bg-primary/80' : 'rounded bg-muted'} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 text-center text-[11px] text-muted-foreground" aria-hidden>
        {weeks.map((w) => (
          <div key={w.week_start} className="min-w-0 flex-1">
            <div className="truncate">{format(parseISO(w.week_start), 'd MMM')}</div>
            {w.active_learners !== undefined && <div className="tabular-nums">{w.active_learners > 0 ? `${w.active_learners} active` : '–'}</div>}
          </div>
        ))}
      </div>
      <figcaption className={compact ? "sr-only" : "text-xs text-muted-foreground"}>Lessons completed each week.{weeks.some((w) => w.active_learners !== undefined) ? " The line under each week shows how many people were active." : ""}</figcaption>
    </figure>
  );
}
