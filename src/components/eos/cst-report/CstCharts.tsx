import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Bucket } from '@/features/eos-cst/cstInsights';

/** A share of a whole as a ring, with whatever sits in the middle (usually the percentage). */
export function Ring({ pct, size = 64, stroke = 8, tone = 'primary', label, children }: { pct: number | null; size?: number; stroke?: number; tone?: 'primary' | 'bad' | 'good'; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct ?? 0));
  const colour = tone === 'bad' ? 'stroke-red-600' : tone === 'good' ? 'stroke-green-600' : 'stroke-primary';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(shown / 100) * c} ${c}`} className={cn(colour, 'transition-[stroke-dasharray] duration-500 motion-reduce:transition-none')} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">{children}</div>
    </div>
  );
}

export interface BarItem {
  key?: string;
  label: string;
  /** What the bar is drawn from. */
  value: number;
  /** What is written at the end of the row. */
  display: string;
  /** Part of the value, drawn darker inside the bar (such as how many were finished). */
  part?: number;
  sub?: string;
}

/** Horizontal bars with the words next to them, so a bar is never the only way to read a number. */
export function HBars({ items, empty, tone = 'primary' }: { items: readonly BarItem[]; empty: string; tone?: 'primary' | 'bad' | 'good' }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const fill = tone === 'bad' ? 'bg-red-500/80' : tone === 'good' ? 'bg-green-600/80' : 'bg-primary/70';
  const dark = tone === 'bad' ? 'bg-red-700' : tone === 'good' ? 'bg-green-800' : 'bg-primary';
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.key ?? i.label} className="space-y-0.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium" title={i.label}>{i.label}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums">{i.display}</span>
          </div>
          <div aria-hidden className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${(i.value / max) * 100}%` }} />
            {i.part !== undefined && <div className={cn('absolute inset-y-0 left-0 rounded-full', dark)} style={{ width: `${(i.part / max) * 100}%` }} />}
          </div>
          {i.sub && <p className="text-[11px] text-muted-foreground">{i.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Counts over time as columns. Empty days stay as gaps. The first, middle and last labels are shown so a long run stays readable. */
export function Columns({ buckets, label }: { buckets: readonly Bucket[]; label: string }) {
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const mid = Math.floor(buckets.length / 2);
  return (
    <div>
      <div role="img" aria-label={`${label}: ${total} in total`} className="flex h-28 items-end gap-px">
        {buckets.map((b) => (
          <div key={b.key} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${b.label}: ${b.count}`}>
            <div className={cn('w-full rounded-t-sm', b.count > 0 ? 'bg-primary' : 'bg-muted')} style={{ height: b.count > 0 ? `${Math.max(6, (b.count / max) * 100)}%` : '3px' }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>{buckets[0]?.label}</span>
        <span>{buckets.length > 2 ? buckets[mid].label : ''}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('space-y-2 rounded-lg border bg-background p-3', className)}>
      <div>
        <h4 className="text-sm font-bold">{title}</h4>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A plain table. Pass onRowClick and the first cell becomes a button that opens that row. */
export function RowTable({ head, rows, empty, onRowClick }: { head: string[]; rows: ReactNode[][]; empty: string; onRowClick?: (index: number) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} scope="col" className="px-2 py-1.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(i) : undefined} className={cn('border-b last:border-0', onRowClick && 'cursor-pointer hover:bg-muted/50')}>
              {cells.map((cell, j) => (
                <td key={j} className={cn('px-2 py-1.5 align-top', j === 0 && 'font-medium')}>
                  {onRowClick && j === 0 ? (
                    <button type="button" className="group inline-flex items-center gap-1 text-left font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {cell}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </button>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
