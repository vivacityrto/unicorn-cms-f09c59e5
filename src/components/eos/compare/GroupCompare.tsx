import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValue } from '@/features/eos-scorecard/scorecardView';
import { biggestMovers, type GroupMove } from '@/features/eos-scorecard/comparison';
import { DeltaChip, Sparkline } from './CompareCharts';

const show = (unit: string, v: number | null) => (v === null ? '–' : formatValue(unit, Math.round(v * 10) / 10));

interface GroupCompareProps {
  moves: readonly GroupMove[];
  unit: string;
  /** What each row is: CSC, Client. */
  groupLabel: string;
  /** The words for the two columns: this week and last week, or this month and last month. */
  nowLabel: string;
  beforeLabel: string;
  /** Show only this many rows with the rest hidden behind a count, for long lists. */
  limit?: number;
  onOpen?: (name: string) => void;
  className?: string;
}

/** Every group's latest number, the one before, the change, its own earlier average and a trend line. */
export function GroupCompare({ moves, unit, groupLabel, nowLabel, beforeLabel, limit, onOpen, className }: GroupCompareProps) {
  if (moves.length === 0) return <p className="text-sm text-muted-foreground">Nothing to compare yet.</p>;
  const rows = limit ? moves.slice(0, limit) : moves;
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-2 py-1.5 font-semibold">{groupLabel}</th>
            <th scope="col" className="px-2 py-1.5 text-right font-semibold">{nowLabel}</th>
            <th scope="col" className="px-2 py-1.5 text-right font-semibold">{beforeLabel}</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Change</th>
            <th scope="col" className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell">Earlier average</th>
            <th scope="col" className="hidden px-2 py-1.5 font-semibold sm:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.name} className="border-b last:border-0">
              <td className="max-w-[14rem] px-2 py-1.5 font-medium">
                {onOpen ? (
                  <button type="button" onClick={() => onOpen(m.name)} className="max-w-full truncate text-left font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={m.name}>
                    {m.name}
                  </button>
                ) : (
                  <span className="block truncate" title={m.name}>{m.name}</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-bold tabular-nums">{show(unit, m.current)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{show(unit, m.previous)}</td>
              <td className="px-2 py-1.5"><DeltaChip unit={unit} delta={m.delta} verdict={m.verdict} /></td>
              <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted-foreground sm:table-cell">{show(unit, m.earlierAverage)}</td>
              <td className="hidden px-2 py-1.5 sm:table-cell">
                <Sparkline points={m.series} verdict={m.verdict} label={`${m.name}: ${m.series.map((v) => (v === null ? 'no number' : show(unit, v))).join(', ')}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && moves.length > limit && <p className="px-2 pt-1 text-xs text-muted-foreground">Showing {limit} of {moves.length}.</p>}
    </div>
  );
}

function MoverList({ title, tone, items, unit }: { title: string; tone: 'up' | 'down'; items: readonly GroupMove[]; unit: string }) {
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  return (
    <div className="space-y-1.5">
      <h4 className={cn('flex items-center gap-1.5 text-sm font-semibold', tone === 'up' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
        <Icon className="h-4 w-4" aria-hidden />
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tone === 'up' ? 'Nobody moved the right way.' : 'Nobody moved the wrong way.'}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((m) => (
            <li key={m.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate" title={m.name}>{m.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{show(unit, m.previous)} → {show(unit, m.current)}</span>
                <DeltaChip unit={unit} delta={m.delta} verdict={m.verdict} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Who moved the right way the most, and who moved the wrong way the most, since the period before. */
export function Movers({ moves, unit, n = 5, className }: { moves: readonly GroupMove[]; unit: string; n?: number; className?: string }) {
  const { climbers, fallers } = biggestMovers(moves, n);
  return (
    <div className={cn('grid gap-4 md:grid-cols-2', className)}>
      <MoverList title="Moved the right way" tone="up" items={climbers} unit={unit} />
      <MoverList title="Moved the wrong way" tone="down" items={fallers} unit={unit} />
    </div>
  );
}
