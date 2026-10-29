import { useMemo, useState } from 'react';
import { ArrowRight, Check, ListPlus, Loader2, Mic, Sparkles, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  RockNotesDictationProvider,
  useOptionalRockNotesDictation,
  useRockNotesDictation,
} from '@/components/eos/rocks/notes/RockNotesDictation';
import { useCreateTodoFromNote, useRockNoteSummary, useRockNotes, useSummariseRockNotes } from '@/hooks/useRockNotes';
import { dbToUiStatus, getStatusConfig } from '@/utils/rockStatusUtils';
import {
  NOTE_MAX_CHARS,
  SIGNAL_LABEL,
  formatNoteDay,
  formatNoteTime,
  lastTimeNotes,
  notesSinceSummary,
  progressText,
  withStatusChanges,
  type NoteWithChange,
} from '@/utils/rockNotes';

export interface NotesRock {
  id: string;
  title: string;
  tenant_id: number;
}

const INITIAL_SHOWN = 3;

const dueInAWeek = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

function StatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  const config = getStatusConfig(dbToUiStatus(status));
  return <span className={cn('rounded-full border px-1.5 py-px text-[11px] font-medium', config.bgColor, config.color)}>{config.label}</span>;
}

function NoteItem({ note, authorName, rockTitle }: { note: NoteWithChange; authorName?: string; rockTitle?: string }) {
  const progress = progressText(note);
  return (
    <li className="space-y-1 border-l-2 border-muted pl-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <time dateTime={note.created_at}>{formatNoteTime(note.created_at)}</time>
        {authorName && <span>· {authorName}</span>}
        {note.source === 'dictated' && (
          <span title="Dictated" className="inline-flex items-center"><Mic className="h-3 w-3" aria-label="Dictated" /></span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {note.statusChangedFrom ? (
          <span className="inline-flex items-center gap-1" aria-label={`Status changed from ${getStatusConfig(dbToUiStatus(note.statusChangedFrom)).label} to ${getStatusConfig(dbToUiStatus(note.rock_status)).label}`}>
            <StatusChip status={note.statusChangedFrom} />
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <StatusChip status={note.rock_status} />
          </span>
        ) : (
          <StatusChip status={note.rock_status} />
        )}
        {progress && <span className="text-muted-foreground">{progress}</span>}
        {rockTitle && <Badge variant="outline" className="max-w-[14rem] truncate text-[11px] font-normal">{rockTitle}</Badge>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
    </li>
  );
}

function SummaryBlock({ rock, noteCount, notes }: { rock: NotesRock; noteCount: number; notes: NoteWithChange[] }) {
  const notesCtx = useRockNotesDictation();
  const summaryQuery = useRockNoteSummary(rock.id);
  const summarise = useSummariseRockNotes();
  const createTodo = useCreateTodoFromNote();
  const summary = summaryQuery.data ?? null;
  const newer = notesSinceSummary(notes, summary);

  if (noteCount === 0) return null;

  const create = async (title: string) => {
    if (!summary) return;
    const key = `${summary.id}:${title}`;
    try {
      await createTodo.mutateAsync({ title, rockTitle: rock.title, rockTenantId: rock.tenant_id, meetingId: notesCtx.meetingId, dueDate: dueInAWeek() });
      notesCtx.markTodoCreated(key);
    } catch {
      // The mutation has already said what went wrong.
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5" aria-hidden />Summary</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={summarise.isPending}
          onClick={() => summarise.mutate({ rockId: rock.id, force: !!summary && newer === 0 })}
        >
          {summarise.isPending ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />Writing…</> : summary ? 'Refresh' : 'Write a summary'}
        </Button>
      </div>
      {summary ? (
        <>
          <p className="whitespace-pre-wrap text-sm">{summary.summary}</p>
          <p className="text-xs text-muted-foreground">
            Notes suggest: <span className="font-medium text-foreground">{SIGNAL_LABEL[summary.status_signal] ?? SIGNAL_LABEL.unclear}</span>
            {' · '}written {formatNoteTime(summary.generated_at)}
            {newer > 0 && <span className="font-medium text-amber-700 dark:text-amber-300"> · {newer} newer {newer === 1 ? 'note' : 'notes'} not included</span>}
          </p>
          {summary.suggested_todos.length > 0 && (
            <ul aria-label="Suggested To-Dos" className="space-y-1">
              {summary.suggested_todos.map(todo => {
                const created = notesCtx.createdTodoKeys.has(`${summary.id}:${todo.title}`);
                return (
                  <li key={todo.title} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
                    <span className="text-sm">{todo.title}</span>
                    {created ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-green-700 dark:text-green-400"><Check className="h-3 w-3" aria-hidden />To-Do created</span>
                    ) : (
                      <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs" disabled={createTodo.isPending} onClick={() => create(todo.title)}>
                        <ListPlus className="h-3 w-3" aria-hidden />Create To-Do
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">An AI summary of how this has progressed, written from the notes.</p>
      )}
      <p className="text-[11px] text-muted-foreground">Written by AI from the notes only. Check it before relying on it. To-Dos are only created when you choose.</p>
    </div>
  );
}

function NotesPanelBody({ rock }: { rock: NotesRock }) {
  const ctx = useRockNotesDictation();
  const notesQuery = useRockNotes(rock.id);
  const [showAll, setShowAll] = useState(false);

  const draft = ctx.getDraft(rock.id);
  const saving = ctx.isSaving(rock.id);
  const listeningHere = ctx.isRecording && ctx.activeRockId === rock.id;
  const handingOver = ctx.handingOverFromRockId !== null && ctx.handingOverFromRockId !== rock.id;
  const listeningElsewhere = !handingOver && ctx.isRecording && ctx.activeRockId !== null && ctx.activeRockId !== rock.id;

  const data = notesQuery.data;
  const ordered = useMemo(() => withStatusChanges(data?.notes ?? []), [data?.notes]);
  const lastTime = useMemo(() => lastTimeNotes(data?.notes ?? [], ctx.meetingId), [data?.notes, ctx.meetingId]);
  const shown = showAll ? ordered : ordered.slice(0, INITIAL_SHOWN);

  const add = () => void ctx.saveDraft(rock.id);

  return (
    <section aria-label="Notes" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Notes{ordered.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{ordered.length}</span>}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1.5', listeningHere && 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300')}
          disabled={!ctx.isSupported}
          aria-pressed={listeningHere}
          title={ctx.isSupported ? undefined : 'Dictation is not available in this browser. Try Chrome or Edge.'}
          onClick={() => (listeningHere ? ctx.stopMic() : ctx.startFor(rock.id))}
        >
          {listeningHere ? <><Square className="h-3.5 w-3.5 fill-current" aria-hidden />Stop</> : <><Mic className="h-3.5 w-3.5" aria-hidden />Dictate</>}
        </Button>
      </div>

      {handingOver && (
        <p role="status" className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Saving the note for the Rock you just left. The microphone moves here in a moment.
        </p>
      )}

      {listeningElsewhere && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span>The microphone is on for another Rock.</span>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => ctx.startFor(rock.id)}>Dictate here instead</Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Textarea
          value={draft}
          rows={3}
          maxLength={NOTE_MAX_CHARS}
          aria-label={`Note for ${rock.title}`}
          placeholder="Where does it stand? What changed? Dictate or type a short summary."
          className="min-h-[76px] resize-y text-sm"
          onChange={event => ctx.setDraft(rock.id, event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              add();
            }
          }}
        />
        {listeningHere && (
          <p className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300" role="status">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
            Listening{ctx.interimTranscript ? <span className="truncate italic text-muted-foreground">… {ctx.interimTranscript}</span> : null}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {draft.trim() ? (draft.length > NOTE_MAX_CHARS - 500 ? `${draft.length} of ${NOTE_MAX_CHARS} characters` : 'Not saved yet') : 'Dated and kept. Notes cannot be edited later.'}
          </p>
          <Button type="button" size="sm" className="h-8" disabled={!draft.trim() || saving} onClick={add}>
            {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />Saving…</> : 'Add note'}
          </Button>
        </div>
      </div>

      {notesQuery.isError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">The notes could not be loaded. Notes you add are still saved.</p>}

      {lastTime && (
        <div className="space-y-1 rounded-lg border bg-muted/30 p-2.5">
          <h4 className="text-xs font-semibold">Last time · {formatNoteDay(lastTime.at)}</h4>
          <ul className="space-y-1">
            {lastTime.notes.slice(-2).map(note => (
              <li key={note.id} className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{note.body}</li>
            ))}
          </ul>
        </div>
      )}

      <SummaryBlock rock={rock} noteCount={ordered.length} notes={ordered} />

      {shown.length > 0 && (
        <ol aria-label="Notes, newest first" className="space-y-3">
          {shown.map(note => (
            <NoteItem
              key={note.id}
              note={note}
              authorName={note.created_by ? data?.authorNames[note.created_by] : undefined}
              rockTitle={data?.includesDescendants && note.rock_id !== rock.id ? data.rockTitles[note.rock_id] : undefined}
            />
          ))}
        </ol>
      )}
      {ordered.length > INITIAL_SHOWN && (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAll(value => !value)}>
          {showAll ? 'Show fewer' : `Show all ${ordered.length} notes`}
        </Button>
      )}
    </section>
  );
}

/**
 * The Notes panel for one Rock. Inside a meeting it shares the meeting's microphone and drafts;
 * anywhere else (the Rocks page) it brings its own, so it works the same on its own.
 */
export function RockNotesPanel({ rock }: { rock: NotesRock }) {
  const shared = useOptionalRockNotesDictation();
  if (shared) return <NotesPanelBody rock={rock} />;
  return (
    <RockNotesDictationProvider>
      <NotesPanelBody rock={rock} />
    </RockNotesDictationProvider>
  );
}
