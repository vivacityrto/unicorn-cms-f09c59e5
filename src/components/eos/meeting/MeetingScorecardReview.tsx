import { useMemo, useState } from 'react';
import { Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { NumberEntry } from '@/components/eos/scorecard-review/NumberEntry';
import { ScorecardDiscussDialog } from '@/components/eos/scorecard-review/ScorecardDiscussDialog';
import { StatusPill } from '@/components/eos/scorecard-review/StatusPill';
import { STATUS_STYLE } from '@/components/eos/scorecard-review/statusStyle';
import { useScorecardMetrics } from '@/hooks/useScorecardMetrics';
import { discussionAreas } from '@/features/eos-scorecard/discussion';
import {
  aimText,
  buildMeasures,
  countStatuses,
  groupAreas,
  headlineSentence,
  lastCompletedWeekKey,
  weekLabel,
  type Measure,
} from '@/features/eos-scorecard/scorecardView';
import { useOwnerNames } from '@/features/eos-scorecard/useOwnerNames';

interface Props {
  /** The live meeting, so an issue raised or a note written lands in this meeting. */
  meeting?: { id?: string; segmentId?: string; type?: string | null; onIssueRaised?: () => void };
}

/**
 * L10 Scorecard segment: the week's scorecard as a short list of areas, with a Discuss button that
 * presents them one at a time. Read the number, do not solve it here: anything off track goes to IDS.
 */
export function MeetingScorecardReview({ meeting }: Props) {
  const { metrics, isLoading, recordEntry } = useScorecardMetrics(false);
  const ownerNames = useOwnerNames();
  const weekKey = useMemo(() => lastCompletedWeekKey(), []);
  const [discussOpen, setDiscussOpen] = useState(false);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const measures = useMemo(() => buildMeasures(metrics, weekKey), [metrics, weekKey]);
  const areas = useMemo(() => groupAreas(measures), [measures]);
  const counts = useMemo(() => countStatuses(measures), [measures]);
  const needRoom = useMemo(() => discussionAreas(areas, { needsRoomOnly: true }).length, [areas]);
  const waiting = measures.filter((m) => m.status === 'waiting' && m.source !== 'automatic');

  const open = (category: string | null) => {
    setStartAt(category);
    setDiscussOpen(true);
  };

  const saveNumber = (m: Measure, value: number) => {
    setSavingId(m.id);
    recordEntry.mutate({ metric: m.metric, value, weekEnding: weekKey }, { onSettled: () => setSavingId(null) });
  };

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" aria-busy="true" />;

  if (measures.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-center text-sm text-muted-foreground">No scorecard measures yet. Add them on the Scorecard page.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 border-0 bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white">
        <p className="text-sm font-semibold text-white/80">Week of {weekLabel(weekKey)}</p>
        <p className="text-2xl font-bold leading-snug">{headlineSentence(counts)}</p>
        <Button type="button" variant="secondary" className="gap-2" onClick={() => open(null)}>
          <Presentation className="h-4 w-4" aria-hidden />
          Discuss the scorecard
        </Button>
      </Card>

      <p className="text-sm text-muted-foreground">
        {needRoom === 0 ? 'No area needs the room.' : `${needRoom} ${needRoom === 1 ? 'area needs' : 'areas need'} the room.`} Read the number, do not solve it here. Anything off track goes to IDS.
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {areas.map((a) => {
          const c = countStatuses(a.measures);
          return (
            <li key={a.category} className={cn('flex flex-col gap-2 rounded-xl border border-l-[5px] bg-card p-4', STATUS_STYLE[a.worst].edge)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{a.name}</h3>
                <StatusPill status={a.worst} />
              </div>
              <p className="text-sm text-muted-foreground">
                {c.on_track} of {c.total} on track
                {c.nearly > 0 ? ` · ${c.nearly} nearly` : ''}
                {c.off_track > 0 ? ` · ${c.off_track} off track` : ''}
                {c.waiting > 0 ? ` · ${c.waiting} waiting for a number` : ''}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-auto self-start" onClick={() => open(a.category)}>
                Discuss this area
              </Button>
            </li>
          );
        })}
      </ul>

      {waiting.length > 0 && (
        <section aria-label="Waiting for a number" className="space-y-2">
          <h3 className="text-base font-bold">Waiting for a number ({waiting.length})</h3>
          <ul className="space-y-2">
            {waiting.map((m) => (
              <li key={m.id} className="grid items-center gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Aim: {aimText(m)} · Owner: {m.ownerId ? ownerNames[m.ownerId] ?? 'Nobody yet' : 'Nobody yet'}
                  </p>
                </div>
                <NumberEntry label={`This week’s number for ${m.name}`} unit={m.unit} saving={savingId === m.id} onSave={(v) => saveNumber(m, v)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ScorecardDiscussDialog
        open={discussOpen}
        onOpenChange={setDiscussOpen}
        areas={areas}
        weekKey={weekKey}
        weekLabel={weekLabel(weekKey)}
        ownerNames={ownerNames}
        startAtCategory={startAt}
        meeting={meeting}
      />
    </div>
  );
}
