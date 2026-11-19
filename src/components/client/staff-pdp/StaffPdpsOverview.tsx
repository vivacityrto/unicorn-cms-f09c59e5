import { AlertTriangle, CheckCircle2, ListChecks, TrendingUp } from 'lucide-react';
import { InsightCards, SegmentBar, type InsightCardItem } from '@/components/client/insight/InsightCards';
import { cn } from '@/lib/utils';
import type { WorkforcePdpRow } from '@/features/pdp/workforce';
import { ALL_STATUSES, STATUS_LABEL, type StaffPdpSummary, elapsedPercent, hoursGap, pctClamped } from './staffPdpInsights';

export type PdpCard = 'all' | 'attention' | 'on_track' | 'current';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const hours = (n: number) => `${Math.round(n * 10) / 10}`;

const STATUS_BAR: Record<string, string> = {
  overdue: 'bg-pink-600',
  at_risk: 'bg-amber-400',
  on_track: 'bg-cyan-500',
  current: 'bg-emerald-500',
};

export function StaffPdpsBanner({ summary, controls }: { summary: StaffPdpSummary; controls: React.ReactNode }) {
  const goodStanding = summary.counts.current + summary.counts.on_track;
  const headline =
    summary.total === 0
      ? 'No PDP cycles match.'
      : summary.counts.overdue > 0
        ? `${summary.counts.overdue} ${plural(summary.counts.overdue, 'PDP is', 'PDPs are')} overdue.`
        : summary.counts.at_risk > 0
          ? `${summary.counts.at_risk} ${plural(summary.counts.at_risk, 'PDP is', 'PDPs are')} at risk of finishing short.`
          : 'Everyone is on track.';
  return (
    <section aria-label="Staff PDP summary" className="brand-surface flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Staff PDPs</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-white/80">{headline} How your team is progressing on professional development, and who needs a nudge.</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="PDP totals">
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.total} {plural(summary.total, 'person', 'people')}</li>
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{goodStanding} in good standing</li>
          {summary.teamProgress !== null && <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.teamProgress}% of team target done</li>}
          {summary.teamGapHours > 0 && <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{hours(summary.teamGapHours)} hours to go</li>}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">{controls}</div>
    </section>
  );
}

export function StaffPdpFilterCards({ summary, active, onSelect }: { summary: StaffPdpSummary; active: PdpCard; onSelect: (c: PdpCard) => void }) {
  const items: InsightCardItem<PdpCard>[] = [
    {
      key: 'all',
      label: 'Everyone',
      value: summary.total,
      insight: summary.byAudience.length > 1 ? `Across ${summary.byAudience.length} audiences` : 'Each person’s latest cycle',
      icon: ListChecks,
    },
    {
      key: 'attention',
      label: 'Needs attention',
      value: summary.needsAttention,
      insight:
        summary.needsAttention === 0
          ? 'Nobody is overdue or at risk'
          : summary.oldestOverdueDays !== null
            ? `Longest overdue: ${summary.oldestOverdueDays} ${plural(summary.oldestOverdueDays, 'day', 'days')}`
            : 'Under 80% done with 30 days or less left',
      icon: AlertTriangle,
      tone: summary.counts.overdue > 0 ? 'bad' : summary.needsAttention > 0 ? 'warn' : 'good',
    },
    {
      key: 'on_track',
      label: 'On track',
      value: summary.counts.on_track,
      insight:
        summary.behindPace > 0
          ? `${summary.behindPace} ${plural(summary.behindPace, 'is', 'are')} behind where the calendar says`
          : summary.nextCycleEnd
            ? `Next cycle ends in ${summary.nextCycleEnd.inDays} ${plural(summary.nextCycleEnd.inDays, 'day', 'days')}`
            : 'Not late yet',
      icon: TrendingUp,
      tone: summary.behindPace > 0 ? 'warn' : 'neutral',
    },
    {
      key: 'current',
      label: 'Target met',
      value: summary.counts.current,
      insight: summary.total ? `${Math.round((summary.counts.current / summary.total) * 100)}% have finished their hours` : 'No cycles yet',
      icon: CheckCircle2,
      tone: 'good',
    },
  ];
  return <InsightCards items={items} active={active} onSelect={onSelect} label="Filter staff by PDP status" />;
}

/** Hours target against hours done, per audience, with the shortfall at the end. */
function HoursGapBars({ rows }: { rows: StaffPdpSummary['byAudience'] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No cycles have an hours target yet.</p>;
  return (
    <ul className="space-y-3" aria-label="Hours done against target, by audience">
      {rows.slice(0, 6).map((a) => {
        const done = a.target > 0 ? Math.min(100, (a.actual / a.target) * 100) : 0;
        return (
          <li key={a.name}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium text-foreground" title={a.name}>{a.name} <span className="font-normal text-muted-foreground">· {a.staff} {plural(a.staff, 'person', 'people')}</span></span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{hours(a.actual)} of {hours(a.target)} h</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${a.name}: ${hours(a.actual)} of ${hours(a.target)} hours done`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${done}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{a.gap > 0 ? `${hours(a.gap)} hours still to do` : 'Target met'}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** How many cycles end in each coming month, with the at-risk or overdue ones in a warmer colour. */
function CycleEndBars({ ends }: { ends: StaffPdpSummary['cycleEnds'] }) {
  const max = Math.max(1, ...ends.months.map((m) => m.count));
  const upcoming = ends.months.reduce((n, m) => n + m.count, 0);
  return (
    <figure className="space-y-3">
      <div role="img" aria-label={`Cycles ending by month: ${ends.months.map((m) => `${m.label} ${m.count}`).join(', ')}${ends.ended ? `; ${ends.ended} already ended unfinished` : ''}`} className="flex h-28 items-end gap-2">
        {ends.months.map((m) => (
          <div key={m.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs tabular-nums text-muted-foreground">{m.count}</span>
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-md bg-muted" style={{ height: `${Math.max(m.count ? 6 : 2, (m.count / max) * 80)}%` }}>
              <div className="bg-primary" style={{ height: `${m.count ? ((m.count - m.risky) / m.count) * 100 : 0}%` }} />
              <div className="bg-pink-600" style={{ height: `${m.count ? (m.risky / m.count) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {upcoming === 0 ? 'No cycles end in the next six months.' : `${upcoming} ${plural(upcoming, 'cycle ends', 'cycles end')} in the next six months.`}
        {ends.ended > 0 && ` ${ends.ended} already ended unfinished.`} Pink bars are overdue or at risk.
      </figcaption>
    </figure>
  );
}

export function StaffPdpInsightPanel({ summary, onOpen }: { summary: StaffPdpSummary; onOpen: (row: WorkforcePdpRow) => void }) {
  if (summary.total === 0) return null;
  const status = ALL_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], count: summary.counts[s], className: STATUS_BAR[s] }));
  return (
    <section aria-label="PDP insights" className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Where everyone stands</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {summary.counts.current + summary.counts.on_track} of {summary.total} are in good standing.
        </p>
        <SegmentBar label="People by PDP status" segments={status} />
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div><dt className="inline font-medium text-foreground">Overdue: </dt><dd className="inline">the cycle has ended unfinished.</dd></div>
          <div><dt className="inline font-medium text-foreground">At risk: </dt><dd className="inline">30 days or less left and under 80% done.</dd></div>
          <div><dt className="inline font-medium text-foreground">On track: </dt><dd className="inline">not late yet, which is not the same as ahead.</dd></div>
          <div><dt className="inline font-medium text-foreground">Current: </dt><dd className="inline">the hours target is met.</dd></div>
        </dl>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Who to nudge first</h2>
        <p className="mb-3 text-xs text-muted-foreground">Overdue first, then at risk, then anyone behind pace.</p>
        {summary.chase.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody needs chasing right now.</p>
        ) : (
          <ul className="space-y-2">
            {summary.chase.slice(0, 5).map(({ row, reason }) => (
              <li key={`${row.user_id}-${row.cycle_year ?? 'x'}`}>
                <button type="button" onClick={() => onOpen(row)} className="w-full rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{row.staff_name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pctClamped(row)}%</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{reason}</span>
                </button>
              </li>
            ))}
            {summary.chase.length > 5 && <li className="text-xs text-muted-foreground">and {summary.chase.length - 5} more in the table below</li>}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Hours by audience</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {summary.teamGapHours > 0 ? `${hours(summary.teamGapHours)} hours still to do across the team.` : 'Every target is met.'}
          {summary.noTarget > 0 && ` ${summary.noTarget} ${plural(summary.noTarget, 'person has', 'people have')} no target set.`}
        </p>
        <HoursGapBars rows={summary.byAudience} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">When cycles end</h2>
        <p className="mb-3 text-xs text-muted-foreground">Plan reminders around the busy months.</p>
        <CycleEndBars ends={summary.cycleEnds} />
      </div>
    </section>
  );
}

/** Progress bar for a row with a tick showing how far through the cycle the calendar is. */
export function PaceBar({ row, today }: { row: WorkforcePdpRow; today?: Date }) {
  const pct = pctClamped(row);
  const elapsed = elapsedPercent(row, today);
  const behind = elapsed !== null && pct < elapsed - 15 && row.currency_status !== 'current';
  const label = `${pct}% of hours done${elapsed !== null ? `, ${elapsed}% of the cycle has passed` : ''}`;
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="relative h-2.5 w-full min-w-[96px] rounded-full bg-muted" role="img" aria-label={label}>
        <div className={cn('h-full rounded-full', behind ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        {elapsed !== null && <span className="absolute -top-0.5 h-3.5 w-0.5 rounded bg-foreground/60" style={{ left: `calc(${elapsed}% - 1px)` }} aria-hidden />}
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

export const hoursLabel = (row: WorkforcePdpRow) => `${hours(Number(row.actual_pd_hours || 0))} of ${hours(Number(row.target_pd_hours || 0))} h`;
export const gapLabel = (row: WorkforcePdpRow) => (hoursGap(row) > 0 ? `${hours(hoursGap(row))} h to go` : Number(row.target_pd_hours) > 0 ? 'Target met' : 'No target set');
