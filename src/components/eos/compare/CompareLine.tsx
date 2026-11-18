import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatValue, type Measure } from '@/features/eos-scorecard/scorecardView';
import { areaMovement, compareSeries, type SeriesComparison } from '@/features/eos-scorecard/comparison';
import { DeltaChip } from './CompareCharts';

const ordinal = (n: number) => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** "Best of 8", "Weakest of 8", "3rd best of 8", or null when there is nothing to rank against. */
export function placeText(c: SeriesComparison): string | null {
  if (!c.rank || c.rank.of < 3) return null;
  if (c.rank.place === 1) return `Best of ${c.rank.of}`;
  if (c.rank.place === c.rank.of) return `Weakest of ${c.rank.of}`;
  return `${ordinal(c.rank.place)} best of ${c.rank.of}`;
}

/** One line for a measure card: the change on last week, the average of the weeks before, and where it ranks. */
export function CompareLine({ measure, className }: { measure: Pick<Measure, 'history' | 'direction' | 'target' | 'unit'>; className?: string }) {
  const c = useMemo(() => compareSeries(measure.history, { direction: measure.direction, target: measure.target, noun: 'week' }), [measure.history, measure.direction, measure.target]);
  if (c.current === null) return null;
  const previous = c.benchmarks.find((b) => b.key === 'previous');
  const average = c.benchmarks.find((b) => b.key === 'recent');
  const place = placeText(c);
  if (!previous && !average && !place) return <p className={cn('text-[11px] text-muted-foreground', className)}>First number recorded, so nothing to compare with yet.</p>;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground xl:text-xs', className)}>
      {previous && (
        <span className="inline-flex items-center gap-1">
          <DeltaChip unit={measure.unit} delta={previous.delta} verdict={previous.verdict} />
          <span>{previous.label === 'Last week' ? 'vs last week' : `vs ${previous.label}`}</span>
        </span>
      )}
      {average && <span title={average.label}>Avg {formatValue(measure.unit, Math.round(average.value * 10) / 10)}</span>}
      {place && <span className="font-semibold text-foreground">{place}</span>}
    </p>
  );
}

/** "Since last week: 2 better, 1 worse" for a whole area, so the room sees the direction before the detail. */
export function AreaMovement({ measures, className }: { measures: readonly Pick<Measure, 'history' | 'direction' | 'target'>[]; className?: string }) {
  const m = useMemo(() => areaMovement(measures), [measures]);
  const parts = [m.better > 0 && `${m.better} better`, m.worse > 0 && `${m.worse} worse`, m.same > 0 && `${m.same} the same`].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className="text-muted-foreground">Since last week</span>
      {m.better > 0 && <span className="font-semibold text-green-700 dark:text-green-400">{m.better} better</span>}
      {m.worse > 0 && <span className="font-semibold text-red-700 dark:text-red-400">{m.worse} worse</span>}
      {m.same > 0 && <span className="text-muted-foreground">{m.same} the same</span>}
    </span>
  );
}
