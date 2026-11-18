import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { areaCue, aimText, formatValue, gapText, type Area, type Measure } from '@/features/eos-scorecard/scorecardView';
import { breakdownKind } from '@/features/eos-scorecard/cstBreakdown';
import { needsRoom, type AreaOutcome } from '@/features/eos-scorecard/discussion';
import type { MetricIssue, ScorecardNote } from '@/features/eos-scorecard/useScorecardDiscussion';
import { AimBar } from './AimBar';
import { AreaNotes } from './AreaNotes';
import { MetricReportDialog } from './MetricReportDialog';
import { MiniTrend } from './MiniTrend';
import { NumberEntry } from './NumberEntry';
import { RaiseMeasureIssue } from './RaiseMeasureIssue';
import { StatusPill } from './StatusPill';
import { STATUS_STYLE } from './statusStyle';
import { WhyThisNumber } from './WhyThisNumber';

interface ScorecardDiscussSlideProps {
  area: Area;
  weekKey: string;
  weekLabel: string;
  ownerNames: Readonly<Record<string, string>>;
  notes: readonly ScorecardNote[];
  myUserId: string | null;
  issues: readonly MetricIssue[];
  issuesState: 'loading' | 'error' | 'ready';
  outcomes: readonly AreaOutcome[];
  raisedMeasureIds: ReadonlySet<string>;
  meeting?: { id?: string; segmentId?: string; type?: string | null };
  onOutcome: (category: string, outcome: AreaOutcome, measureId?: string) => void;
  onRecordNumber?: (measure: Measure, value: number) => void;
  savingMeasureId?: string | null;
}

/**
 * How many columns the measures use. Wide screens put a whole area side by side so it fits one screen without scrolling;
 * narrower ones stack in two columns.
 */
function columnsFor(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3';
  if (count === 4) return 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-4';
  if (count <= 6) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-3 2xl:grid-cols-4';
}

/**
 * One area, laid out to fit a single screen: the question and every measure on the left, the meeting notes on the
 * right at full height. On a narrow or short screen the page scrolls rather than hiding anything.
 */
export function ScorecardDiscussSlide({ area, weekKey, weekLabel, ownerNames, notes, myUserId, issues, issuesState, outcomes, raisedMeasureIds, meeting, onOutcome, onRecordNumber, savingMeasureId = null }: ScorecardDiscussSlideProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [report, setReport] = useState<{ measure: Measure; ask: boolean } | null>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [area.category]);
  const dense = area.measures.length > 4;

  return (
    <article
      aria-label={`Area: ${area.name}`}
      className="flex min-h-0 flex-col gap-3 lg:grid lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]"
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 ref={headingRef} tabIndex={-1} data-slide-heading className="break-words text-2xl font-bold leading-tight outline-none lg:text-3xl xl:text-4xl">{area.name}</h2>
          <StatusPill status={area.worst} />
          <span className="text-sm text-muted-foreground">
            {area.measures.length} {area.measures.length === 1 ? 'measure' : 'measures'}
            {area.who ? ` · ${area.who}` : ''}
          </span>
        </header>

        <section aria-label="What to ask the room" className="rounded-xl border-l-4 border-l-primary bg-muted/40 px-3 py-2">
          <p className="flex items-start gap-2.5 text-base font-medium leading-snug xl:text-lg">
            <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {areaCue(area)}
          </p>
        </section>

        <ul className={cn('grid min-h-0 flex-1 auto-rows-fr gap-3', columnsFor(area.measures.length))}>
          {area.measures.map((m) => {
            const owner = m.ownerId ? ownerNames[m.ownerId] ?? null : null;
            const explained = breakdownKind(m.metric.metric_key) !== null;
            return (
              <li key={m.id} className={cn('flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-l-[5px] bg-card p-3 xl:p-4', STATUS_STYLE[m.status].edge)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-bold leading-snug xl:text-lg">{m.name}</h3>
                    <p className="text-xs text-muted-foreground xl:text-sm">
                      Owner: {owner ?? 'Nobody yet'} · Aim: {aimText(m)}
                    </p>
                  </div>
                  <StatusPill status={m.status} />
                </div>

                <div className="grid items-end gap-x-3 gap-y-1 grid-cols-[auto_minmax(0,1fr)]">
                  <span className="text-4xl font-bold leading-none tabular-nums xl:text-5xl">{formatValue(m.unit, m.value)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{gapText(m)}</p>
                    <AimBar measure={m} showCaption={false} />
                  </div>
                </div>
                <MiniTrend measure={m} className="hidden min-w-0 2xl:block" />

                {!dense && m.description && <p className="line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}

                {m.value === null && m.source !== 'automatic' && onRecordNumber && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-2.5">
                    <p className="text-sm text-muted-foreground">Type this week’s number. It saves to the scorecard.</p>
                    <NumberEntry label={`This week’s number for ${m.name}`} unit={m.unit} saving={savingMeasureId === m.id} onSave={(v) => onRecordNumber(m, v)} />
                  </div>
                )}

                {explained && <WhyThisNumber measure={m} weekKey={weekKey} onOpenReport={() => setReport({ measure: m, ask: false })} />}

                <div className="mt-auto flex flex-wrap items-start gap-2">
                  {needsRoom(m) && (
                    <RaiseMeasureIssue
                      measure={m}
                      weekKey={weekKey}
                      ownerName={owner}
                      existing={issues.filter((i) => i.metricId === m.id)}
                      existingState={issuesState}
                      raisedNow={raisedMeasureIds.has(m.id)}
                      meeting={meeting}
                      onRaised={() => onOutcome(area.category, 'raised', m.id)}
                    />
                  )}
                  {m.value !== null && (
                    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setReport({ measure: m, ask: true })}>
                      <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                      Ask Viv
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <AreaNotes
        key={area.category}
        category={area.category}
        areaName={area.name}
        meetingId={meeting?.id}
        notes={notes}
        myUserId={myUserId}
        ownerNames={ownerNames}
        onSaved={() => onOutcome(area.category, 'noted')}
        className="lg:sticky lg:top-0 lg:h-full lg:max-h-full"
      />
      {outcomes.length > 0 && <p className="sr-only">Recorded: {outcomes.join(', ')}</p>}

      {report && <MetricReportDialog open onOpenChange={(open) => !open && setReport(null)} measure={report.measure} autoAsk={report.ask} weekKey={weekKey} weekLabel={weekLabel} />}
    </article>
  );
}
