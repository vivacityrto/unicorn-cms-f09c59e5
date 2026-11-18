import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { clientSeries, cscSeriesByName, CST_SERIES, PERIOD_NOUN, seriesDef, shortPeriodLabel, totalSeries, type CstSeriesKey } from '@/features/eos-cst/cstHistory';
import { useCstHistory } from '@/features/eos-cst/useCstReport';
import type { CstPeriod } from '@/features/eos-cst/cstReport';
import { compareSeries, groupMoves, rankSentence } from '@/features/eos-scorecard/comparison';
import { formatValue } from '@/features/eos-scorecard/scorecardView';
import { BenchmarkBars, DeltaChip, TrendChart } from '@/components/eos/compare/CompareCharts';
import { CompareSummary } from '@/components/eos/compare/CompareSummary';
import { GroupCompare, Movers } from '@/components/eos/compare/GroupCompare';

interface CstCompareProps {
  period: CstPeriod;
  /** A date inside the period on screen. */
  anchor: string;
  /** "Week ending 22 Nov 2026" and the like, for the headings. */
  label: string;
  /** The period on screen has not finished, so its counts can still grow. */
  inProgress?: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The period on screen against the ones before it: a small trend per measure, then, for the chosen one, how it sits
 * against its own history, how each CSC and client moved, and who moved most. Asks the same report for earlier dates.
 */
export function CstCompare({ period, anchor, label, inProgress = false }: CstCompareProps) {
  const [which, setWhich] = useState<CstSeriesKey>('portal');
  const { anchors, reports, isLoading, failed } = useCstHistory(period, anchor);
  const noun = PERIOD_NOUN[period];
  const def = seriesDef(which);

  const labels = useMemo(() => reports.map((r, i) => (r ? shortPeriodLabel(period, r) : anchors[i].slice(5))), [reports, anchors, period]);
  const cards = useMemo(
    () =>
      CST_SERIES.map((d) => {
        const points = totalSeries(d, reports);
        return { def: d, points, comparison: compareSeries(points, { direction: d.direction, noun }) };
      }),
    [reports, noun],
  );
  const chosen = cards.find((c) => c.def.key === which) ?? cards[0];
  const average = chosen.comparison.benchmarks.find((b) => b.key === 'recent' || b.key === 'earlier');
  const cscMoves = useMemo(() => groupMoves(cscSeriesByName(def, reports), def.direction), [def, reports]);
  const clientMoves = useMemo(() => groupMoves(clientSeries(def, reports).map((c) => ({ name: c.name, series: c.series })), def.direction), [def, reports]);
  const enough = chosen.comparison.count >= 2;

  return (
    <section id="cst-compare" aria-label="How it compares" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-xl font-bold">How it compares</h2>
        <p className="text-sm text-muted-foreground">
          {cap(label || `This ${noun}`)} against the {reports.length - 1} {noun}s before it. Choose a measure to see how it sits against its own history, and who moved.
        </p>
      </div>

      {isLoading && reports.every((r) => !r) ? (
        <div className="h-56 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />
      ) : (
        <>
          {inProgress && period !== 'days28' && (
            <p role="status" className="rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              This {noun} has not finished, so its numbers can still grow. Compare it with the earlier {noun}s with that in mind.
            </p>
          )}
          {failed > 0 && (
            <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {failed === 1 ? 'One earlier period' : `${failed} earlier periods`} could not be loaded, so {failed === 1 ? 'it is' : 'they are'} left blank.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => {
              const previous = c.comparison.benchmarks.find((b) => b.key === 'previous');
              const selected = c.def.key === which;
              return (
                <button
                  key={c.def.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setWhich(c.def.key)}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                  )}
                >
                  <span className="text-sm font-semibold text-muted-foreground">{c.def.label}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-3xl font-bold leading-none tabular-nums">{formatValue(c.def.unit, c.comparison.current)}</span>
                    {previous && <DeltaChip unit={c.def.unit} delta={previous.delta} verdict={previous.verdict} />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{previous ? `${previous.label} was ${formatValue(c.def.unit, Math.round(previous.value * 10) / 10)}` : `No earlier ${noun} to compare`}</span>
                  <TrendChart points={c.points} labels={labels} unit={c.def.unit} compact summary={`${c.def.label} over the last ${c.points.length} ${noun}s.`} className="mt-1" />
                  {rankSentence(c.comparison, noun) && <span className="text-xs font-medium">{rankSentence(c.comparison, noun)}</span>}
                </button>
              );
            })}
          </div>

          <div className="space-y-4 rounded-xl border bg-background p-4" aria-live="polite">
            <div>
              <h3 className="text-lg font-bold">{def.label}</h3>
              <p className="text-sm text-muted-foreground">{def.hint}</p>
            </div>
            {!enough ? (
              <p className="text-sm text-muted-foreground">There is only one {noun} with a number, so there is nothing to compare yet.</p>
            ) : (
              <>
                <CompareSummary comparison={chosen.comparison} noun={noun} />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <TrendChart
                    points={chosen.points}
                    labels={labels}
                    unit={def.unit}
                    average={average?.value ?? null}
                    summary={`${def.label} over the last ${chosen.points.length} ${noun}s. Latest ${formatValue(def.unit, chosen.comparison.current)}.`}
                  />
                  <BenchmarkBars comparison={chosen.comparison} unit={def.unit} currentLabel={`This ${noun}`} />
                </div>
                {period === 'year' && <p className="text-xs text-muted-foreground">Academy certificates started in 2026, so earlier years have few or none.</p>}
                {period !== 'week' && <p className="text-xs text-muted-foreground">Earlier {noun}s use today’s users and Live Clients, so they show how each {noun} looked with the people we have now.</p>}

                <div className="space-y-2">
                  <h4 className="text-base font-bold">By CSC</h4>
                  <GroupCompare moves={cscMoves} unit={def.unit} groupLabel="CSC" nowLabel={`This ${noun}`} beforeLabel={`Last ${noun}`} />
                </div>

                <div className="space-y-2">
                  <h4 className="text-base font-bold">Clients that moved most</h4>
                  <p className="text-sm text-muted-foreground">Compared with the {noun} before. {def.key === 'clients' ? 'A client is 100 when someone used the portal and 0 when nobody did.' : ''}</p>
                  <Movers moves={clientMoves} unit={def.unit} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
