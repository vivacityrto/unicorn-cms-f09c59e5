import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DiscussWrapUp } from '@/components/eos/meeting/discuss/DiscussWrapUp';
import { RockDiscussSlide } from '@/components/eos/meeting/discuss/RockDiscussSlide';
import { cn } from '@/lib/utils';
import { useOptionalRockNotesDictation } from '@/components/eos/rocks/notes/RockNotesDictation';
import { useOpenIssueRockIds } from '@/hooks/useRockDiscussion';
import { useOverdueTodoCountsByRock } from '@/hooks/useRockTodos';
import type { RockCascadeNode } from '@/utils/meetingRocksCascade';
import { discussionDeck, nodesById, wrapUp, type DiscussionOutcome } from '@/utils/rockDiscussion';
import { dbToUiStatus } from '@/utils/rockStatusUtils';

interface RockDiscussDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The same cascade the Rock Review shows, so the deck and the segment always agree. */
  roots: readonly RockCascadeNode[];
  ownerNames: Readonly<Record<string, string>>;
  quarterLabel: string;
  startAttentionOnly?: boolean;
  /** Start on this Rock when it is in the deck. */
  startAtRockId?: string | null;
  meeting?: { id?: string; segmentId?: string; type?: string | null; onIssueRaised?: () => void };
  onOpenDetails: (rockId: string) => void;
}

const RAIL_COLOUR: Record<string, string> = {
  on_track: 'bg-green-500', at_risk: 'bg-amber-500', off_track: 'bg-red-500', blocked: 'bg-violet-500', not_started: 'bg-gray-400', complete: 'bg-blue-500',
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Presents the Rocks under review one at a time, full screen, so the facilitator can share
 * it and keep the room on the Rock in front of them. Left and right arrows move; Escape leaves.
 * The deck is fixed when it opens, so a Rock does not vanish from under the room when its
 * status changes. Rock Review stays a yes/no: anything needing a conversation is raised for IDS.
 */
function DiscussDeck({ open, onOpenChange: onOpenChangeProp, roots, ownerNames, quarterLabel, startAttentionOnly = false, startAtRockId = null, meeting, onOpenDetails }: RockDiscussDialogProps) {
  const [attentionOnly, setAttentionOnly] = useState(startAttentionOnly);
  const allRockIds = useMemo(() => discussionDeck(roots), [roots]);
  // Rocks with an overdue To-Do linked to them need the room even when their own status looks fine.
  const overdueByRock = useOverdueTodoCountsByRock(allRockIds, open);
  const overdueIds = useMemo(() => new Set(Object.keys(overdueByRock.data ?? {})), [overdueByRock.data]);
  const [deck, setDeck] = useState<string[]>(() => discussionDeck(roots, { attentionOnly: startAttentionOnly }));
  const [position, setPosition] = useState(() => Math.max(0, deck.indexOf(startAtRockId ?? '')));
  const [outcomes, setOutcomes] = useState<Record<string, DiscussionOutcome[]>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');

  const nodes = useMemo(() => nodesById(roots), [roots]);
  const atWrapUp = position >= deck.length;
  const currentId = atWrapUp ? null : deck[position];
  const node = currentId ? nodes.get(currentId) : undefined;

  // Notes: the microphone follows the Rock on screen, and the Rock it leaves is saved. Closing the
  // view stops it and saves every draft, so a note typed or dictated is never lost on the way out.
  const notes = useOptionalRockNotesDictation();
  const retarget = notes?.retarget;
  useEffect(() => {
    if (currentId) retarget?.(currentId);
  }, [currentId, retarget]);
  const onOpenChange = (next: boolean) => {
    if (!next) void notes?.flushAll();
    onOpenChangeProp(next);
  };

  const openIssues = useOpenIssueRockIds(deck, open && atWrapUp);
  const summary = useMemo(
    () => wrapUp(deck, outcomes, nodes, new Set(openIssues.data ?? [])),
    [deck, outcomes, nodes, openIssues.data],
  );

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), deck.length);
    setPosition(clamped);
    const target = clamped >= deck.length ? undefined : nodes.get(deck[clamped]);
    setAnnouncement(target ? `Rock ${clamped + 1} of ${deck.length}: ${target.rock.title}` : 'Wrap-up');
  };

  const record = (rockId: string, outcome: DiscussionOutcome) => {
    setOutcomes(current => (current[rockId]?.includes(outcome) ? current : { ...current, [rockId]: [...(current[rockId] ?? []), outcome] }));
    if (outcome === 'raised') meeting?.onIssueRaised?.();
  };

  const changeFilter = (only: boolean) => {
    const next = discussionDeck(roots, { attentionOnly: only, extraAttentionIds: overdueIds });
    setAttentionOnly(only);
    setDeck(next);
    setPosition(Math.max(0, next.indexOf(currentId ?? '')));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Portalled dialogs (blocker, resolve) bubble through React to here; only act on keys from this view.
    if (event.defaultPrevented || !contentRef.current?.contains(event.target as Node) || isTyping(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); go(position + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(position - 1); }
    if (event.key === 'Home') { event.preventDefault(); go(0); }
    if (event.key === 'End') { event.preventDefault(); go(deck.length); }
  };

  const totalAll = useMemo(() => discussionDeck(roots).length, [roots]);
  const totalAttention = useMemo(() => discussionDeck(roots, { attentionOnly: true, extraAttentionIds: overdueIds }).length, [roots, overdueIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onKeyDown={onKeyDown}
        className="left-0 top-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        // Land on the Rock, not on a button, so the first arrow key press already works.
        onOpenAutoFocus={event => {
          event.preventDefault();
          contentRef.current?.querySelector<HTMLElement>('[data-slide-heading]')?.focus();
        }}
      >
        <DialogTitle className="sr-only">Discuss the Rocks</DialogTitle>
        <DialogDescription className="sr-only">
          Step through the Rocks under review. Use the left and right arrow keys to move between them, and Escape to leave.
        </DialogDescription>
        <div aria-live="polite" role="status" className="sr-only">{announcement}</div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-3 py-2 pr-14 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rock Review · {quarterLabel}</p>
          <p className="text-sm tabular-nums" aria-hidden>
            {atWrapUp ? 'Wrap-up' : <><span className="font-semibold">{position + 1}</span> of {deck.length}</>}
          </p>
          {deck.length > 0 && (
            // One segment per Rock, squeezing to fit, so the strip never scrolls sideways however many Rocks there are.
            <nav aria-label="Rocks in this review" className="order-last flex min-w-0 basis-full items-center gap-1 sm:order-none sm:flex-1 sm:basis-0">
              {deck.map((id, index) => {
                const n = nodes.get(id);
                const status = n ? dbToUiStatus(n.rock.status) : 'on_track';
                const done = (outcomes[id]?.length ?? 0) > 0;
                const current = index === position;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    aria-label={`Rock ${index + 1}: ${n?.rock.title ?? ''}${done ? ' (done)' : ''}`}
                    title={`${index + 1}. ${n?.rock.title ?? ''}`}
                    onClick={() => go(index)}
                    className={cn('flex h-4 min-w-[6px] max-w-10 flex-1 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1', RAIL_COLOUR[status], current ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100')}
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
          <div role="group" aria-label="Which Rocks" className="ml-auto flex rounded-md border">
            <button type="button" aria-pressed={!attentionOnly} onClick={() => changeFilter(false)} className={cn('rounded-l-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !attentionOnly ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50')}>
              All Rocks <span className="tabular-nums">{totalAll}</span>
            </button>
            <button type="button" aria-pressed={attentionOnly} onClick={() => changeFilter(true)} className={cn('rounded-r-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', attentionOnly ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50')}>
              Needs the room <span className="tabular-nums">{totalAttention}</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 lg:px-6">
          {deck.length === 0 ? (
            <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
              <h2 tabIndex={-1} data-slide-heading className="text-2xl font-semibold outline-none">{attentionOnly ? 'Nothing needs the room' : 'No Rocks to review'}</h2>
              <p className="text-muted-foreground">{attentionOnly ? 'Every Rock under review is on track and has nothing flagged.' : `There are no active Rocks under review for ${quarterLabel}.`}</p>
              {attentionOnly && <Button type="button" onClick={() => changeFilter(false)}>Show all Rocks</Button>}
            </div>
          ) : atWrapUp ? (
            <DiscussWrapUp
              summary={summary}
              onClose={() => onOpenChange(false)}
              onGoTo={title => {
                const index = deck.findIndex(id => nodes.get(id)?.rock.title === title);
                if (index >= 0) go(index);
              }}
            />
          ) : node ? (
            <RockDiscussSlide
              key={node.rock.id}
              node={node}
              ownerNames={ownerNames}
              outcomes={outcomes[node.rock.id] ?? []}
              meeting={meeting}
              quarterLabel={quarterLabel}
              onOutcome={record}
              onOpenDetails={onOpenDetails}
            />
          ) : (
            <p className="py-16 text-center text-muted-foreground">This Rock is no longer in the review.</p>
          )}
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

/**
 * Mounted only while open: every opening starts from a fresh deck in whatever state the segment
 * is in now, and nothing in it runs (or fetches) while the view is closed.
 */
export function RockDiscussDialog(props: RockDiscussDialogProps) {
  if (!props.open) return null;
  return <DiscussDeck {...props} />;
}
