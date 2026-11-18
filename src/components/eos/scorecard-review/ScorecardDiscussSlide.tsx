import { useEffect, useRef } from 'react';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { areaCue, aimText, formatValue, gapText, type Area } from '@/features/eos-scorecard/scorecardView';
import { needsRoom, type AreaOutcome } from '@/features/eos-scorecard/discussion';
import type { MetricIssue, ScorecardNote } from '@/features/eos-scorecard/useScorecardDiscussion';
import { AimBar } from './AimBar';
import { AreaNotes } from './AreaNotes';
import { MiniTrend } from './MiniTrend';
import { RaiseMeasureIssue } from './RaiseMeasureIssue';
import { StatusPill } from './StatusPill';
import { STATUS_STYLE } from './statusStyle';

interface ScorecardDiscussSlideProps {
  area: Area;
  weekKey: string;
  ownerNames: Readonly<Record<string, string>>;
  notes: readonly ScorecardNote[];
  myUserId: string | null;
  issues: readonly MetricIssue[];
  issuesState: 'loading' | 'error' | 'ready';
  outcomes: readonly AreaOutcome[];
  raisedMeasureIds: ReadonlySet<string>;
  meeting?: { id?: string; segmentId?: string; type?: string | null };
  onOutcome: (category: string, outcome: AreaOutcome, measureId?: string) => void;
}

/** One area, laid out for the room: the question, every number against its aim, then notes and anything to raise. */
export function ScorecardDiscussSlide({ area, weekKey, ownerNames, notes, myUserId, issues, issuesState, outcomes, raisedMeasureIds, meeting, onOutcome }: ScorecardDiscussSlideProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [area.category]);

  return (
    <article aria-label={`Area: ${area.name}`} className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      <div className="min-w-0 flex-1 space-y-4">
        <header className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={area.worst} />
            <span className="text-sm text-muted-foreground">
              {area.measures.length} {area.measures.length === 1 ? 'measure' : 'measures'}
              {area.who ? ` · ${area.who}` : ''}
            </span>
          </div>
          <h2 ref={headingRef} tabIndex={-1} data-slide-heading className="break-words text-2xl font-bold leading-tight outline-none lg:text-4xl">{area.name}</h2>
        </header>

        <section aria-label="What to ask the room" className="rounded-xl border-l-4 border-l-primary bg-muted/40 px-3 py-2.5">
          <p className="flex items-start gap-2.5 text-base font-medium leading-snug lg:text-xl">
            <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {areaCue(area)}
          </p>
        </section>

        <ul className="space-y-3">
          {area.measures.map((m) => {
            const owner = m.ownerId ? ownerNames[m.ownerId] ?? null : null;
            return (
              <li key={m.id} className={cn('space-y-3 rounded-xl border border-l-[5px] bg-card p-4', STATUS_STYLE[m.status].edge)}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold leading-snug">{m.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Owner: {owner ?? 'Nobody yet'} · Aim: {aimText(m)}
                    </p>
                    {m.description && <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl font-bold leading-none tabular-nums">{formatValue(m.unit, m.value)}</span>
                      <StatusPill status={m.status} />
                    </div>
                    <p className="text-sm font-semibold">{gapText(m)}</p>
                    <AimBar measure={m} />
                  </div>
                  <MiniTrend measure={m} />
                </div>
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
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-w-0 lg:sticky lg:top-0 lg:w-80 lg:shrink-0 xl:w-96">
        <AreaNotes
          key={area.category}
          category={area.category}
          areaName={area.name}
          meetingId={meeting?.id}
          notes={notes}
          myUserId={myUserId}
          ownerNames={ownerNames}
          onSaved={() => onOutcome(area.category, 'noted')}
        />
        {outcomes.length > 0 && <p className="sr-only">Recorded: {outcomes.join(', ')}</p>}
      </div>
    </article>
  );
}
