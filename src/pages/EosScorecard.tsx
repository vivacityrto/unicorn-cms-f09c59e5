import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import { MetricEditorDialogV2 } from '@/components/eos/scorecard2/MetricEditorDialogV2';
import { AreaAccordion } from '@/components/eos/scorecard-review/AreaAccordion';
import { MeasureCard } from '@/components/eos/scorecard-review/MeasureCard';
import { NumberEntry } from '@/components/eos/scorecard-review/NumberEntry';
import { StatusPill } from '@/components/eos/scorecard-review/StatusPill';
import { usePermission } from '@/hooks/usePermission';
import { useScorecardMetrics } from '@/hooks/useScorecardMetrics';
import {
  STATUS_LABEL,
  STATUS_MARK,
  aimText,
  areaName,
  buildMeasures,
  countStatuses,
  formatValue,
  groupAreas,
  headlineSentence,
  lastCompletedWeekKey,
  shiftWeek,
  shortDate,
  sortWorstFirst,
  weekLabel,
  type Measure,
  type PlainStatus,
} from '@/features/eos-scorecard/scorecardView';
import { useOwnerNames } from '@/features/eos-scorecard/useOwnerNames';
import type { ScorecardMetric } from '@/types/scorecard';

/**
 * How many weeks back the page lets you look. The metrics hook loads 91 days of entries and each measure
 * shows an 8-week history, so going further back would draw recorded weeks as missing.
 */
const WEEKS_BACK = 4;

const LEGEND: { status: PlainStatus; text: string }[] = [
  { status: 'on_track', text: 'at or better than the aim' },
  { status: 'nearly', text: 'within 10% of the aim' },
  { status: 'off_track', text: 'further away than that' },
  { status: 'waiting', text: 'nothing recorded this week' },
];

function ArchivedMeasures({ onUnarchive }: { onUnarchive: (id: string) => void }) {
  const { metrics, isLoading } = useScorecardMetrics(true);
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (metrics.length === 0) return <p className="text-sm text-muted-foreground">Nothing is archived.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {metrics.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="min-w-0 truncate font-medium">{m.name}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onUnarchive(m.id)}>
            Bring back
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function EosScorecard() {
  const { metrics, isLoading, createMetric, updateMetric, archiveMetric, recordEntry } = useScorecardMetrics(false);
  const ownerNames = useOwnerNames();
  const canManage = usePermission('eos.scorecard.manage');

  const latestKey = useMemo(() => lastCompletedWeekKey(), []);
  const [weekKey, setWeekKey] = useState(latestKey);
  const [editing, setEditing] = useState<ScorecardMetric | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [archiving, setArchiving] = useState<Measure | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const measures = useMemo(() => buildMeasures(metrics, weekKey), [metrics, weekKey]);
  const counts = useMemo(() => countStatuses(measures), [measures]);
  const attention = useMemo(() => sortWorstFirst(measures.filter((m) => m.status === 'off_track' || m.status === 'nearly')), [measures]);
  const waiting = useMemo(() => measures.filter((m) => m.status === 'waiting'), [measures]);
  const areas = useMemo(() => groupAreas(measures), [measures]);
  const ownerOf = (m: Measure) => (m.ownerId ? ownerNames[m.ownerId] ?? null : null);

  const saveNumber = (measure: Measure, value: number) => {
    setSavingId(measure.id);
    recordEntry.mutate({ metric: measure.metric, value, weekEnding: weekKey }, { onSettled: () => setSavingId(null) });
  };

  const openEditor = (metric: ScorecardMetric | null) => {
    setEditing(metric);
    setEditorOpen(true);
  };

  const save = (payload: Partial<ScorecardMetric> & { id?: string }) => {
    if (payload.id) {
      updateMetric.mutate({ id: payload.id, ...payload }, { onSuccess: () => { setEditorOpen(false); setEditing(null); } });
    } else {
      createMetric.mutate(payload, { onSuccess: () => setEditorOpen(false) });
    }
  };

  const canGoBack = weekKey > shiftWeek(latestKey, -WEEKS_BACK);
  const canGoForward = weekKey < latestKey;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scorecard</h1>
          <p className="mt-0.5 text-base text-muted-foreground">
            Week of {weekLabel(weekKey)}. What we measure each week, and whether we are hitting the aim.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={!canGoBack} onClick={() => setWeekKey(shiftWeek(weekKey, -1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous week
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={!canGoForward} onClick={() => setWeekKey(shiftWeek(weekKey, 1))}>
            Next week <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <PermissionTooltip permission="vto:edit" action="add scorecard measures">
            <Button type="button" size="sm" className="gap-1.5" disabled={!canManage} onClick={() => openEditor(null)}>
              <Plus className="h-4 w-4" aria-hidden /> Add a measure
            </Button>
          </PermissionTooltip>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : measures.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-16 text-center">
          <h2 className="text-lg font-semibold">No measures yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add your first measure to start tracking the scorecard. You can start from a ready-made one.</p>
          <PermissionTooltip permission="vto:edit" action="add scorecard measures">
            <Button type="button" className="mt-4 gap-1.5" disabled={!canManage} onClick={() => openEditor(null)}>
              <Plus className="h-4 w-4" aria-hidden /> Add your first measure
            </Button>
          </PermissionTooltip>
        </div>
      ) : (
        <>
          <section aria-label="This week at a glance" className="space-y-3 rounded-xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white">
            <p className="text-2xl font-bold leading-snug sm:text-[1.7rem]">{headlineSentence(counts)}</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/90">
              {LEGEND.map((l) => (
                <li key={l.status}>
                  <span aria-hidden="true">{STATUS_MARK[l.status]}</span> {STATUS_LABEL[l.status]}: {l.text}
                </li>
              ))}
            </ul>
          </section>

          {attention.length > 0 && (
            <section aria-label="Needs attention this week" className="space-y-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  Needs attention this week <StatusPill status="off_track" className="!px-2" />
                </h2>
                <p className="text-sm text-muted-foreground">These are what the L10 will ask about. Nothing here needs fixing on this page.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {attention.map((m) => (
                  <MeasureCard
                    key={m.id}
                    measure={m}
                    areaName={areaName(m.category)}
                    ownerName={ownerOf(m)}
                    action={
                      m.category === 'CST' ? (
                        <Link to="/eos/cst-report" className="font-semibold text-primary hover:underline">
                          See which clients &rsaquo;
                        </Link>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {waiting.length > 0 && (
            <section aria-label="Waiting for a number" className="space-y-3">
              <div>
                <h2 className="text-xl font-bold">
                  Waiting for a number <span className="ml-1 text-base font-semibold text-muted-foreground">({waiting.length})</span>
                </h2>
                <p className="text-sm text-muted-foreground">Nothing has been recorded for this week. Type the number in and save it, or leave it for the owner.</p>
              </div>
              <ul className="space-y-2">
                {waiting.map((m) => (
                  <li key={m.id} className="grid items-center gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Aim: {aimText(m)} &middot; Owner: {ownerOf(m) ?? 'Nobody yet'} &middot;{' '}
                        {m.lastEntry ? `Last number: ${formatValue(m.unit, m.lastEntry.value)} (week of ${shortDate(m.lastEntry.weekEnding)})` : 'No number has ever been recorded'}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{m.description}</p>
                    {m.source === 'automatic' ? (
                      <p className="text-sm text-muted-foreground">Fills in by itself on Monday morning.</p>
                    ) : (
                      <NumberEntry label={`This week’s number for ${m.name}`} unit={m.unit} saving={savingId === m.id} onSave={(v) => saveNumber(m, v)} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="All measures" className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">All measures, by area</h2>
              <p className="text-sm text-muted-foreground">Open an area, then a measure, for its history and how the number is worked out.</p>
            </div>
            <AreaAccordion
              areas={areas}
              ownerNames={ownerNames}
              canManage={canManage}
              savingId={savingId}
              onSaveNumber={saveNumber}
              onEdit={(m) => openEditor(m.metric)}
              onArchive={setArchiving}
            />
          </section>
        </>
      )}

      <section aria-label="Archived measures" className="space-y-2">
        <Button type="button" variant="link" className="h-auto p-0" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived measures' : 'Show archived measures'}
        </Button>
        {showArchived && (
          <ArchivedMeasures onUnarchive={(id) => updateMetric.mutate({ id, is_archived: false, is_active: true })} />
        )}
      </section>

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        title="Archive this measure"
        description={`Archive "${archiving?.name ?? ''}"? It leaves the scorecard and the L10, and its history is kept. You can bring it back from the archived list.`}
        confirmText={archiveMetric.isPending ? 'Archiving...' : 'Archive'}
        isLoading={archiveMetric.isPending}
        onConfirm={() => {
          if (archiving) archiveMetric.mutate(archiving.id, { onSettled: () => setArchiving(null) });
        }}
      />

      <MetricEditorDialogV2
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
        metric={editing}
        onSave={save}
        isSaving={createMetric.isPending || updateMetric.isPending}
        existingNames={metrics.map((m) => m.name)}
      />
    </div>
  );
}
