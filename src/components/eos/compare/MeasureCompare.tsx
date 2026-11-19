import { useMemo } from 'react';
import { addDays, formatValue, type Measure } from '@/features/eos-scorecard/scorecardView';
import { compareSeries, weekStatuses } from '@/features/eos-scorecard/comparison';
import { weekEndingOf } from '@/features/eos-scorecard/metricReport';
import { BenchmarkBars, TrendChart } from './CompareCharts';
import { useElementWidth } from './useElementWidth';
import { CompareSummary } from './CompareSummary';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** The week-ending label under each point of a measure's history, oldest first. */
export function weekLabels(weekKey: string, count: number): string[] {
  const end = weekEndingOf(weekKey);
  return Array.from({ length: count }, (_, i) => shortDay(addDays(end, -7 * (count - 1 - i))));
}

/** A measure's own recent weeks against its aim, its last week, its average and its best and weakest week. */
export function MeasureCompare({ measure, weekKey }: { measure: Measure; weekKey: string }) {
  // Side by side only when the panel is wide enough for both; otherwise the bars sit under the chart.
  const [box, width] = useElementWidth<HTMLDivElement>(900);
  const comparison = useMemo(() => compareSeries(measure.history, { direction: measure.direction, target: measure.target, noun: 'week' }), [measure.history, measure.direction, measure.target]);
  const statuses = useMemo(() => weekStatuses(measure.history, measure.target, measure.direction), [measure.history, measure.target, measure.direction]);
  const labels = useMemo(() => weekLabels(weekKey, measure.history.length), [weekKey, measure.history.length]);
  const average = comparison.benchmarks.find((b) => b.key === 'recent' || b.key === 'earlier');
  const onTrack = statuses.filter((s) => s === 'on_track').length;
  const counted = statuses.filter((s) => s !== 'waiting').length;

  if (comparison.count === 0) return <p className="text-sm text-muted-foreground">No numbers have been recorded for this measure yet.</p>;

  const summary = `${measure.name} over the last ${measure.history.length} weeks. Latest ${formatValue(measure.unit, measure.value)}.`;
  return (
    <div ref={box} className="space-y-3">
      <CompareSummary comparison={comparison} />
      <div className={width >= 860 ? 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5' : 'grid gap-3'}>
        <div>
          <TrendChart points={measure.history} labels={labels} unit={measure.unit} target={measure.target} average={average?.value ?? null} statuses={statuses} summary={summary} />
          <p className="mt-1 text-xs text-muted-foreground">Dot colour shows how each week stood against the aim. Weeks with no number are left blank.</p>
        </div>
        <div className="space-y-2">
          <BenchmarkBars comparison={comparison} unit={measure.unit} currentLabel="This week" />
          {counted > 0 && (
            <p className="pt-1 text-sm">
              <span className="font-semibold">On track in {onTrack} of the last {counted} {counted === 1 ? 'week' : 'weeks'}</span> that had a number.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
