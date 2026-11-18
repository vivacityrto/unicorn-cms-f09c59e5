import { useRef } from 'react';
import { Check, Loader2, Mic, NotebookPen, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ScorecardNote } from '@/features/eos-scorecard/useScorecardDiscussion';
import { useOptionalScorecardNotesDictation } from '@/features/eos-scorecard/useScorecardNotesDictation';

interface AreaNotesProps {
  category: string;
  areaName: string;
  notes: readonly ScorecardNote[];
  myUserId: string | null;
  ownerNames: Readonly<Record<string, string>>;
  onSaved: () => void;
  className?: string;
}

const MAX = 5000;
/** Starters that turn a blank box into notes people can act on afterwards. */
const STARTERS = ['Decision', 'Action', 'Why', 'Who'] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';

/**
 * Notes for one area in this meeting. Your own is editable and can be dictated; everyone else's is read-only.
 * The text and the microphone live in the deck, so moving to the next area saves this note and keeps listening.
 */
export function AreaNotes({ category, areaName, notes, myUserId, ownerNames, onSaved, className }: AreaNotesProps) {
  const ctx = useOptionalScorecardNotesDictation();
  const others = notes.filter((n) => n.category === category && n.createdBy !== myUserId);
  const field = useRef<HTMLTextAreaElement>(null);

  const meetingId = ctx?.meetingId;
  const draft = ctx?.getDraft(category) ?? '';
  const dirty = !!ctx?.isDirty(category);
  const saving = !!ctx?.isSaving(category);
  const hasSaved = !dirty && draft.trim().length > 0;
  const canSave = !!meetingId && dirty && !!draft.trim() && !saving;
  const listeningHere = !!ctx && ctx.isRecording && ctx.activeCategory === category;
  const handingOver = !!ctx && ctx.handingOverFrom !== null && ctx.handingOverFrom !== category;
  const listeningElsewhere = !!ctx && !handingOver && ctx.isRecording && ctx.activeCategory !== null && ctx.activeCategory !== category;

  const submit = async () => {
    if (!ctx || !canSave) return;
    if (await ctx.saveDraft(category)) onSaved();
  };

  const startWith = (word: string) => {
    if (!ctx) return;
    const current = ctx.getDraft(category);
    ctx.setDraft(category, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${word}: `);
    requestAnimationFrame(() => field.current?.focus());
  };

  return (
    <section aria-label={`Notes for ${areaName}`} className={cn('flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm', className)}>
      <header className="flex items-center gap-3 border-b bg-gradient-to-r from-[#44235F]/15 to-[#7130A0]/10 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <NotebookPen className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-tight">Meeting notes</h3>
          <p className="truncate text-xs text-muted-foreground">{areaName}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 shrink-0 gap-1.5', listeningHere && 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300')}
          disabled={!ctx || !ctx.isSupported || !meetingId}
          aria-pressed={listeningHere}
          title={ctx?.isSupported === false ? 'Dictation is not available in this browser. Try Chrome or Edge.' : 'Speak your notes. Next saves them and keeps listening for the next area.'}
          onClick={() => (listeningHere ? ctx?.stopMic() : ctx?.startFor(category))}
        >
          {listeningHere ? <><Square className="h-3.5 w-3.5 fill-current" aria-hidden />Stop</> : <><Mic className="h-3.5 w-3.5" aria-hidden />Dictate</>}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {others.length > 0 && (
          <ul className="space-y-2">
            {others.map((n) => {
              const who = ownerNames[n.createdBy] ?? 'A colleague';
              return (
                <li key={n.id} className="flex gap-2.5 rounded-xl bg-muted/50 p-2.5">
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{initials(who)}</span>
                  <span className="min-w-0 text-sm">
                    <span className="block text-xs font-semibold text-muted-foreground">{who}</span>
                    <span className="whitespace-pre-wrap break-words">{n.body}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {handingOver && (
          <p role="status" className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Saving the note for the area you just left. The microphone moves here in a moment.
          </p>
        )}
        {listeningElsewhere && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <span>The microphone is on for another area.</span>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => ctx?.startFor(category)}>Dictate here instead</Button>
          </div>
        )}

        <form
          className="flex min-h-0 flex-1 flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor={`area-note-${category}`} className="sr-only">
            Your note for {areaName}
          </Label>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Start a line with">
            <span className="text-xs text-muted-foreground">Start with</span>
            {STARTERS.map((word) => (
              <button
                key={word}
                type="button"
                disabled={!meetingId}
                onClick={() => startWith(word)}
                className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {word}
              </button>
            ))}
          </div>
          <Textarea
            ref={field}
            id={`area-note-${category}`}
            value={draft}
            onChange={(e) => ctx?.setDraft(category, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            maxLength={MAX}
            placeholder="What was said, decided or agreed? Type, or press Dictate and talk."
            disabled={!meetingId}
            className="min-h-32 flex-1 resize-none text-base leading-relaxed"
          />
          {listeningHere && (
            <p className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300" role="status">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
              Listening{ctx?.interimTranscript ? <span className="truncate italic text-muted-foreground">… {ctx.interimTranscript}</span> : null}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {hasSaved ? (
                <span className="inline-flex items-center gap-1 font-semibold text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Saved
                </span>
              ) : (
                <>
                  <span className="tabular-nums">{draft.length}</span>/{MAX} · Next saves it
                </>
              )}
            </p>
            <Button type="submit" size="sm" className="gap-2" disabled={!canSave}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save note
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
