import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useElementWidth } from './useElementWidth';
import { formatValue } from '@/features/eos-scorecard/scorecardView';
import { signedAmount, type Benchmark, type Points, type SeriesComparison, type Verdict } from '@/features/eos-scorecard/comparison';
import type { PlainStatus } from '@/features/eos-scorecard/scorecardView';

const TONE: Record<Verdict, string> = {
  better: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300',
  worse: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  same: 'bg-muted text-muted-foreground',
};
const WORD: Record<Verdict, string> = { better: 'better', worse: 'worse', same: 'no change' };

/** A change as a coloured chip. The arrow and the word say it too, so colour is never the only signal. */
export function DeltaChip({ unit, delta, verdict, className }: { unit: string; delta: number | null; verdict: Verdict | null; className?: string }) {
  if (delta === null || verdict === null) return <span className={cn('text-xs text-muted-foreground', className)}>–</span>;
  const Icon = verdict === 'same' ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', TONE[verdict], className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {verdict === 'same' ? 'No change' : signedAmount(unit, delta)}
      <span className="sr-only"> ({WORD[verdict]})</span>
    </span>
  );
}

const DOT: Record<PlainStatus, string> = {
  on_track: 'fill-green-600',
  nearly: 'fill-amber-500',
  off_track: 'fill-red-600',
  waiting: 'fill-muted-foreground',
};

interface TrendChartProps {
  points: Points;
  /** One label per point, shown under it. */
  labels: readonly string[];
  unit: string;
  /** The aim, drawn as a dashed line. */
  target?: number | null;
  /** The average of the earlier periods, drawn as a dotted line. */
  average?: number | null;
  /** Colours each dot by how it stood against the aim. */
  statuses?: readonly PlainStatus[];
  /** A sentence for screen readers. */
  summary: string;
  compact?: boolean;
  className?: string;
}

const COMPACT_W = 600;

/**
 * A line over time with the aim and the earlier average as reference lines, the latest point marked, and every number
 * written beside its point. Gaps stay gaps: a period with no number breaks the line.
 */
export function TrendChart({ points, labels, unit, target = null, average = null, statuses, summary, compact = false, className }: TrendChartProps) {
  // A full-size chart is drawn at its real pixel width so its text stays the same size however wide the panel is.
  const [box, measured] = useElementWidth<HTMLElement>(COMPACT_W);
  const W = compact ? COMPACT_W : Math.max(320, measured);
  const numbers = points.filter((v): v is number => v !== null);
  if (numbers.length === 0) return <p className="text-sm text-muted-foreground">No numbers yet.</p>;

  const H = compact ? 120 : 200;
  const padX = 28;
  const top = 22;
  const bottom = 26;
  const refs = [...numbers, ...(target !== null ? [target] : []), ...(average !== null ? [average] : [])];
  let lo = Math.min(...refs);
  let hi = Math.max(...refs);
  if (lo >= 0 && lo < hi * 0.5) lo = 0;
  if (hi === lo) hi = lo + 1;
  const room = (hi - lo) * 0.08;
  if (lo !== 0) lo -= room;
  hi += room;
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (n - 1));
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);

  // Break the line at gaps.
  const runs: { i: number; v: number }[][] = [];
  let drawing = false;
  points.forEach((v, i) => {
    if (v === null) {
      drawing = false;
      return;
    }
    if (!drawing) {
      runs.push([]);
      drawing = true;
    }
    runs[runs.length - 1].push({ i, v });
  });
  const line = (run: { i: number; v: number }[]) => run.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = (run: { i: number; v: number }[]) => `${line(run)} L${x(run[run.length - 1].i).toFixed(1)},${H - bottom} L${x(run[0].i).toFixed(1)},${H - bottom} Z`;
  const showEvery = n > 10 ? 2 : 1;
  const last = n - 1;

  return (
    <figure ref={box} className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block h-auto w-full overflow-visible">
        <line x1={padX} x2={W - padX} y1={H - bottom} y2={H - bottom} className="stroke-border" strokeWidth={1} />
        {target !== null && (
          <g>
            <line x1={padX} x2={W - padX} y1={y(target)} y2={y(target)} className="stroke-foreground/70" strokeWidth={1.25} strokeDasharray="6 4" />
            <text x={W - padX} y={y(target) - 4} textAnchor="end" className="fill-foreground/80 text-[11px]">Aim {formatValue(unit, target)}</text>
          </g>
        )}
        {average !== null && (
          <g>
            <line x1={padX} x2={W - padX} y1={y(average)} y2={y(average)} className="stroke-primary/60" strokeWidth={1.25} strokeDasharray="2 4" />
            <text x={padX} y={y(average) - 4} className="fill-primary text-[11px]">Earlier average {formatValue(unit, Math.round(average * 10) / 10)}</text>
          </g>
        )}
        {runs.filter((r) => r.length > 1).map((r, k) => (
          <path key={`a${k}`} d={area(r)} className="fill-primary/10" />
        ))}
        {runs.filter((r) => r.length > 1).map((r, k) => (
          <path key={`l${k}`} d={line(r)} fill="none" className="stroke-primary" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((v, i) =>
          v === null ? null : (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r={i === last ? 6 : 4} className={cn(statuses ? DOT[statuses[i] ?? 'waiting'] : 'fill-primary', 'stroke-background')} strokeWidth={2} />
              {(i === last || i % showEvery === 0) && (
                <text x={x(i)} y={y(v) - 10} textAnchor="middle" className={cn('text-[11px] tabular-nums', i === last ? 'fill-foreground font-bold' : 'fill-muted-foreground')}>
                  {formatValue(unit, v)}
                </text>
              )}
            </g>
          ),
        )}
        {labels.map((label, i) =>
          i % showEvery === 0 || i === last ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === last && n > 1 ? 'end' : 'middle'} className={cn('text-[11px]', i === last ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}>
              {label}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="sr-only">
        {summary}{' '}
        {points.map((v, i) => `${labels[i] ?? i + 1}: ${v === null ? 'no number' : formatValue(unit, v)}`).join('; ')}
      </figcaption>
    </figure>
  );
}

/** A tiny trend for a table row: no axes, the latest point marked, coloured by whether the latest move was good. */
export function Sparkline({ points, verdict, label, className }: { points: Points; verdict: Verdict | null; label: string; className?: string }) {
  const numbers = points.filter((v): v is number => v !== null);
  if (numbers.length < 2) return <span className="text-xs text-muted-foreground">–</span>;
  const w = 84;
  const h = 24;
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  const span = hi - lo || 1;
  const n = points.length;
  const x = (i: number) => 3 + (i * (w - 6)) / Math.max(n - 1, 1);
  const y = (v: number) => 3 + (1 - (v - lo) / span) * (h - 6);
  let d = '';
  let pen = false;
  points.forEach((v, i) => {
    if (v === null) pen = false;
    else {
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    }
  });
  const lastIdx = points.length - 1;
  const lastVal = points[lastIdx];
  const stroke = verdict === 'better' ? 'stroke-green-600' : verdict === 'worse' ? 'stroke-red-600' : 'stroke-muted-foreground';
  const fill = verdict === 'better' ? 'fill-green-600' : verdict === 'worse' ? 'fill-red-600' : 'fill-muted-foreground';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className={cn('h-6 w-[5.25rem] shrink-0', className)}>
      <path d={d} fill="none" className={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {lastVal !== null && lastVal !== undefined && <circle cx={x(lastIdx)} cy={y(lastVal)} r={2.5} className={fill} />}
    </svg>
  );
}

/** The current number beside each thing it can be compared with, as bars from zero with the change written at the end. */
export function BenchmarkBars({ comparison, unit, currentLabel = 'This week' }: { comparison: SeriesComparison; unit: string; currentLabel?: string }) {
  if (comparison.current === null || comparison.benchmarks.length === 0) return <p className="text-sm text-muted-foreground">There is nothing earlier to compare with yet.</p>;
  interface Row { key: string; label: string; value: number; bench?: Benchmark }
  const rows: Row[] = [{ key: 'now', label: currentLabel, value: comparison.current }, ...comparison.benchmarks.map((b) => ({ key: b.key, label: b.label, value: b.value, bench: b }))];
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
          <span className={cn('leading-tight', !r.bench ? 'font-bold' : 'text-muted-foreground')}>{r.label}</span>
          <span aria-hidden className="relative h-3 overflow-hidden rounded-full bg-muted">
            <span className={cn('absolute inset-y-0 left-0 rounded-full', !r.bench ? 'bg-primary' : 'bg-primary/35')} style={{ width: `${Math.max((Math.abs(r.value) / max) * 100, 1.5)}%` }} />
          </span>
          <span className="flex items-center justify-end gap-2">
            <span className={cn('tabular-nums', !r.bench ? 'font-bold' : 'font-medium')}>{formatValue(unit, Math.round(r.value * 10) / 10)}</span>
            {r.bench ? <DeltaChip unit={unit} delta={r.bench.delta} verdict={r.bench.verdict} className="min-w-[5.5rem] justify-center" /> : <span className="w-[5.5rem]" aria-hidden />}
          </span>
        </li>
      ))}
    </ul>
  );
}
