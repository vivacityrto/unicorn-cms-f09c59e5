import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { discussionAreas, wrapUp, type AreaOutcome } from '@/features/eos-scorecard/discussion';
import { STATUS_LABEL, type Area, type Measure } from '@/features/eos-scorecard/scorecardView';
import { openIssueMetricIds, useMetricIssues, useScorecardNotes } from '@/features/eos-scorecard/useScorecardDiscussion';
import { ScorecardDiscussSlide } from './ScorecardDiscussSlide';
import { ScorecardWrapUp } from './ScorecardWrapUp';
import { STATUS_STYLE } from './statusStyle';

interface ScorecardDiscussDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The same areas the segment lists, so the deck and the segment always agree. */
  areas: readonly Area[];
  weekKey: string;
  weekLabel: string;
  ownerNames: Readonly<Record<string, string>>;
  startNeedsRoomOnly?: boolean;
  startAtCategory?: string | null;
  meeting?: { id?: string; segmentId?: string; type?: string | null; onIssueRaised?: () => void };
  /** Type in a number that has not been recorded for the week. Without it, the deck only reads numbers. */
  onRecordNumber?: (measure: Measure, value: number) => void;
  savingMeasureId?: string | null;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Presents the scorecard one area at a time, full screen, so the facilitator can share it and keep the
 * room on the area in front of them. Left and right arrows move; Escape leaves. The deck is fixed when it
 * opens, so an area does not vanish from under the room.
 */
function Deck({ open, onOpenChange, areas, weekKey, weekLabel, ownerNames, startNeedsRoomOnly = false, startAtCategory = null, meeting, onRecordNumber, savingMeasureId = null }: ScorecardDiscussDialogProps) {
  const { profile } = useAuth();
  const [needsRoomOnly, setNeedsRoomOnly] = useState(startNeedsRoomOnly);
  // Which areas are in the deck, and in what order, is fixed when it opens. Their numbers stay live, so a number typed in
  // during the meeting shows straight away.
  const [fixedDeck, setDeck] = useState<Area[]>(() => discussionAreas(areas, { needsRoomOnly: startNeedsRoomOnly }));
  const deck = useMemo(() => fixedDeck.map((a) => areas.find((x) => x.category === a.category) ?? a), [fixedDeck, areas]);
  const [position, setPosition] = useState(() => Math.max(0, fixedDeck.findIndex((a) => a.category === startAtCategory)));
  const [outcomes, setOutcomes] = useState<Record<string, AreaOutcome[]>>({});
  const [raisedMeasures, setRaisedMeasures] = useState<ReadonlySet<string>>(new Set());
  const [viewed, setViewed] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const atWrapUp = position >= deck.length;
  const area = atWrapUp ? undefined : deck[position];

  const allMetricIds = useMemo(() => areas.flatMap((a) => a.measures.map((m) => m.id)), [areas]);
  const issuesQuery = useMetricIssues(allMetricIds, open);
  const issues = useMemo(() => issuesQuery.data ?? [], [issuesQuery.data]);
  const issuesState = issuesQuery.isError ? 'error' : issuesQuery.isLoading ? 'loading' : 'ready';
  const notesQuery = useScorecardNotes(meeting?.id, open);
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  useEffect(() => {
    if (area) setViewed((current) => (current.has(area.category) ? current : new Set(current).add(area.category)));
  }, [area]);

  const summary = useMemo(
    () => wrapUp(deck, outcomes, new Set(notes.map((n) => n.category)), openIssueMetricIds(issues), viewed),
    [deck, outcomes, notes, issues, viewed],
  );

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), deck.length);
    setPosition(clamped);
    const target = clamped >= deck.length ? undefined : deck[clamped];
    setAnnouncement(target ? `Area ${clamped + 1} of ${deck.length}: ${target.name}` : 'Wrap-up');
  };

  const record = (category: string, outcome: AreaOutcome, measureId?: string) => {
    setOutcomes((current) => (current[category]?.includes(outcome) ? current : { ...current, [category]: [...(current[category] ?? []), outcome] }));
    if (outcome === 'raised') {
      if (measureId) setRaisedMeasures((current) => new Set(current).add(measureId));
      meeting?.onIssueRaised?.();
    }
  };

  const changeFilter = (only: boolean) => {
    const next = discussionAreas(areas, { needsRoomOnly: only });
    setNeedsRoomOnly(only);
    setDeck(next);
    setPosition(Math.max(0, next.findIndex((a) => a.category === area?.category)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Portalled dialogs bubble through React to here; only act on keys from this view.
    if (event.defaultPrevented || !contentRef.current?.contains(event.target as Node) || isTyping(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); go(position + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(position - 1); }
    if (event.key === 'Home') { event.preventDefault(); go(0); }
    if (event.key === 'End') { event.preventDefault(); go(deck.length); }
  };

  const totalAll = areas.length;
  const totalNeedsRoom = useMemo(() => discussionAreas(areas, { needsRoomOnly: true }).length, [areas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onKeyDown={onKeyDown}
        className="left-0 top-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.querySelector<HTMLElement>('[data-slide-heading]')?.focus();
        }}
      >
        <DialogTitle className="sr-only">Discuss the scorecard</DialogTitle>
        <DialogDescription className="sr-only">Step through the scorecard one area at a time. Use the left and right arrow keys to move between areas, and Escape to leave.</DialogDescription>
        <div aria-live="polite" role="status" className="sr-only">{announcement}</div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-3 py-2 pr-14 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scorecard · {weekLabel}</p>
          <p className="text-sm tabular-nums" aria-hidden>
            {atWrapUp ? 'Wrap-up' : <><span className="font-semibold">{position + 1}</span> of {deck.length}</>}
          </p>
          {deck.length > 0 && (
            <nav aria-label="Areas in this review" className="order-last flex min-w-0 basis-full items-center gap-1 sm:order-none sm:flex-1 sm:basis-0">
              {deck.map((a, index) => {
                const done = (outcomes[a.category]?.length ?? 0) > 0;
                const current = index === position;
                return (
                  <button
                    key={a.category}
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    aria-label={`Area ${index + 1}: ${a.name}, ${STATUS_LABEL[a.worst]}${done ? ' (done)' : ''}`}
                    title={`${index + 1}. ${a.name}`}
                    onClick={() => go(index)}
                    className={cn('flex h-4 min-w-[10px] max-w-16 flex-1 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1', STATUS_STYLE[a.worst].bar, current ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100')}
                  >
                    {done && <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />}
                  </button>
                );
              })}
              <button
                type="button"
                aria-current={atWrapUp ? 'step' : undefined}
                onClick={() => go(deck.length)}
                className={cn('ml-1 h-5 shrink-0 rounded-full border px-2 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', atWrapUp ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
              >
                Wrap-up
              </button>
            </nav>
          )}
          <div role="group" aria-label="Which areas" className="ml-auto flex rounded-md border">
            <button type="button" aria-pressed={!needsRoomOnly} onClick={() => changeFilter(false)} className={cn('rounded-l-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !needsRoomOnly ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50')}>
              All areas <span className="tabular-nums">{totalAll}</span>
            </button>
            <button type="button" aria-pressed={needsRoomOnly} onClick={() => changeFilter(true)} className={cn('rounded-r-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', needsRoomOnly ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50')}>
              Needs the room <span className="tabular-nums">{totalNeedsRoom}</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-5 lg:px-6">
          {deck.length === 0 ? (
            <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
              <h2 tabIndex={-1} data-slide-heading className="text-2xl font-semibold outline-none">{needsRoomOnly ? 'Nothing needs the room' : 'No measures to review'}</h2>
              <p className="text-muted-foreground">{needsRoomOnly ? 'Every area is on track and has all its numbers.' : 'There are no measures on the scorecard yet.'}</p>
              {needsRoomOnly && <Button type="button" onClick={() => changeFilter(false)}>Show all areas</Button>}
            </div>
          ) : atWrapUp ? (
            <ScorecardWrapUp
              summary={summary}
              onClose={() => onOpenChange(false)}
              onGoTo={(name) => {
                const index = deck.findIndex((a) => a.name === name);
                if (index >= 0) go(index);
              }}
            />
          ) : area ? (
            <ScorecardDiscussSlide
              key={area.category}
              area={area}
              weekKey={weekKey}
              weekLabel={weekLabel}
              ownerNames={ownerNames}
              notes={notes}
              myUserId={profile?.user_uuid ?? null}
              issues={issues}
              issuesState={issuesState}
              outcomes={outcomes[area.category] ?? []}
              raisedMeasureIds={raisedMeasures}
              meeting={meeting}
              onOutcome={record}
              onRecordNumber={onRecordNumber}
              savingMeasureId={savingMeasureId}
            />
          ) : null}
        </div>

        {deck.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t bg-background px-3 py-2 sm:px-5">
            <Button type="button" variant="outline" className="h-10 gap-1.5 px-4" disabled={position === 0} onClick={() => go(position - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </Button>
            <p className="hidden text-xs text-muted-foreground lg:block">Use the ← and → keys to move. Esc leaves.</p>
            {atWrapUp ? (
              <Button type="button" className="h-10 px-4" onClick={() => onOpenChange(false)}>Finish</Button>
            ) : (
              <Button type="button" className="h-10 gap-1.5 px-4" onClick={() => go(position + 1)}>
                {position === deck.length - 1 ? 'Wrap-up' : 'Next'}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while open: every opening starts from a fresh deck, and nothing in it fetches while closed. */
export function ScorecardDiscussDialog(props: ScorecardDiscussDialogProps) {
  if (!props.open) return null;
  return <Deck {...props} />;
}
