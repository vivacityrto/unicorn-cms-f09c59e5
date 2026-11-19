import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InsightTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface InsightCardItem<K extends string> {
  key: K;
  label: string;
  /** The big number. */
  value: number | string;
  /** One line saying what it means or what to look at. */
  insight: string;
  icon: LucideIcon;
  tone?: InsightTone;
}

const TILE: Record<InsightTone, string> = {
  neutral: 'bg-primary/10 text-primary',
  good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  bad: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

/**
 * Filter cards: each shows a count and a line about what it means, and clicking one filters the list below it. They are
 * toggle buttons (aria-pressed), so they work with the keyboard and screen readers like the tabs they replace.
 */
export function InsightCards<K extends string>({ items, active, onSelect, label }: { items: InsightCardItem<K>[]; active: K; onSelect: (key: K) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', items.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
      {items.map((item) => {
        const Icon = item.icon;
        const selected = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            aria-pressed={selected}
            className={cn(
              'flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'border-primary bg-primary/5 ring-2 ring-primary/30',
            )}
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE[item.tone ?? 'neutral'])}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</span>{' '}
              <span className="block text-2xl font-bold tabular-nums text-foreground">{item.value}</span>{' '}
              <span className="block text-xs text-muted-foreground">{item.insight}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A horizontal bar made of coloured segments, with a legend underneath. Widths are shares of the total. */
export function SegmentBar({ segments, label }: { segments: Array<{ key: string; label: string; count: number; className: string }>; label: string }) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  return (
    <figure className="space-y-2">
      <div role="img" aria-label={label} className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments
            .filter((s) => s.count > 0)
            .map((s) => <span key={s.key} className={cn('h-full', s.className)} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', s.className)} aria-hidden />
            {s.label} <span className="tabular-nums font-medium text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Rows of a name, a bar and a count, for "who has what". */
export function RankBars({ rows, empty }: { rows: Array<{ name: string; count: number; muted?: boolean }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 text-sm">
          <span className={cn('truncate', r.muted ? 'text-muted-foreground' : 'font-medium text-foreground')} title={r.name}>{r.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn('block h-full rounded-full', r.muted ? 'bg-muted-foreground/40' : 'bg-primary')} style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
