import { AlertTriangle, CheckCircle2, Clock, ListChecks } from 'lucide-react';
import { InsightCards, RankBars, SegmentBar, type InsightCardItem } from '@/components/client/insight/InsightCards';
import type { TaskSummary } from './taskInsights';

export type TaskFilter = 'all' | 'overdue' | 'due_soon' | 'completed';

const SEGMENT_CLASS: Record<string, string> = {
  todo: 'bg-slate-400',
  in_progress: 'bg-sky-500',
  blocked: 'bg-red-500',
  waiting_client: 'bg-amber-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-zinc-300 dark:bg-zinc-600',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function TasksBanner({ summary, mineCount, mineOnly, onToggleMine, archivedControl }: { summary: TaskSummary; mineCount: number; mineOnly: boolean; onToggleMine: () => void; archivedControl: React.ReactNode }) {
  const headline =
    summary.total === 0
      ? 'No tasks yet.'
      : summary.overdue > 0
        ? `${summary.overdue} ${plural(summary.overdue, 'task is', 'tasks are')} overdue.`
        : summary.open === 0
          ? 'Everything is done.'
          : `${summary.open} open ${plural(summary.open, 'task', 'tasks')}, none overdue.`;
  return (
    <section aria-label="Tasks summary" className="brand-surface flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="mt-0.5 text-sm text-white/80">{headline} All your tasks across every package and stage.</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Task totals">
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.open} open</li>
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.completed} done</li>
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.completionPercent}% complete</li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleMine}
          aria-pressed={mineOnly}
          className={`keep-light rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${mineOnly ? 'border-white bg-white text-[#44235F]' : 'border-white/40 bg-white/10 text-white hover:bg-white/20'}`}
        >
          My tasks · {mineCount}
        </button>
        {archivedControl}
      </div>
    </section>
  );
}

export function TaskFilterCards({ summary, counts, active, onSelect }: { summary: TaskSummary; counts: Record<TaskFilter, number>; active: TaskFilter; onSelect: (f: TaskFilter) => void }) {
  const items: InsightCardItem<TaskFilter>[] = [
    {
      key: 'all',
      label: 'All tasks',
      value: counts.all,
      insight: summary.open === 0 ? 'Nothing open right now' : `${summary.open} still open`,
      icon: ListChecks,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: counts.overdue,
      insight: summary.oldestOverdueDays != null ? `Oldest is ${summary.oldestOverdueDays} ${plural(summary.oldestOverdueDays, 'day', 'days')} late` : 'Nothing is late',
      icon: AlertTriangle,
      tone: counts.overdue > 0 ? 'bad' : 'good',
    },
    {
      key: 'due_soon',
      label: 'Due soon',
      value: counts.due_soon,
      insight: summary.nextDue ? `Next: ${summary.nextDue.name} ${summary.nextDue.inDays === 0 ? 'today' : `in ${summary.nextDue.inDays} ${plural(summary.nextDue.inDays, 'day', 'days')}`}` : 'Nothing due in the next few days',
      icon: Clock,
      tone: counts.due_soon > 0 ? 'warn' : 'neutral',
    },
    {
      key: 'completed',
      label: 'Completed',
      value: counts.completed,
      insight: `${summary.completionPercent}% of tasks are done`,
      icon: CheckCircle2,
      tone: 'good',
    },
  ];
  return <InsightCards items={items} active={active} onSelect={onSelect} label="Filter tasks" />;
}

/** Where the work stands, and who is carrying it. Sits between the cards and the table, using the width. */
export function TasksInsightPanel({ summary }: { summary: TaskSummary }) {
  if (summary.total === 0) return null;
  return (
    <section aria-label="Task insights" className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Where the work stands</h2>
        <SegmentBar
          label="Tasks by status"
          segments={summary.byStatus.map((s) => ({ key: s.key, label: s.label, count: s.count, className: SEGMENT_CLASS[s.key] }))}
        />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Open tasks by person</h2>
        <RankBars rows={summary.byAssignee.slice(0, 6).map((a) => ({ name: a.name, count: a.count, muted: a.unassigned }))} empty="No open tasks." />
      </div>
    </section>
  );
}
