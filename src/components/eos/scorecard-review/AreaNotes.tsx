import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useSaveScorecardNote, type ScorecardNote } from '@/features/eos-scorecard/useScorecardDiscussion';

interface AreaNotesProps {
  category: string;
  areaName: string;
  meetingId?: string;
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

/** Notes for one area in this meeting. Your own is editable; everyone else's is read-only. Fills the height it is given. */
export function AreaNotes({ category, areaName, meetingId, notes, myUserId, ownerNames, onSaved, className }: AreaNotesProps) {
  const save = useSaveScorecardNote(meetingId);
  const mine = notes.find((n) => n.category === category && n.createdBy === myUserId);
  const others = notes.filter((n) => n.category === category && n.createdBy !== myUserId);
  const [draft, setDraft] = useState(mine?.body ?? '');
  // Pick up the saved note when it first arrives, without overwriting what is being typed.
  const [seeded, setSeeded] = useState(!!mine);
  const [touched, setTouched] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (mine && !seeded && !touched) {
      setDraft(mine.body);
      setSeeded(true);
    }
  }, [mine, seeded, touched]);

  const dirty = draft.trim() !== (mine?.body ?? '');
  const canSave = !!meetingId && dirty && !!draft.trim() && !save.isPending;
  const saved = !!mine && !dirty && !save.isPending;

  const submit = async () => {
    if (!canSave) return;
    try {
      await save.mutateAsync({ category, body: draft });
      onSaved();
    } catch {
      // The mutation has already said what went wrong; the text stays.
    }
  };

  const startWith = (word: string) => {
    setTouched(true);
    setDraft((current) => `${current}${current && !current.endsWith('\n') ? '\n' : ''}${word}: `);
    requestAnimationFrame(() => field.current?.focus());
  };

  return (
    <section aria-label={`Notes for ${areaName}`} className={cn('flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm', className)}>
      <header className="flex items-center gap-3 border-b bg-gradient-to-r from-[#44235F]/15 to-[#7130A0]/10 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <NotebookPen className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight">Meeting notes</h3>
          <p className="truncate text-xs text-muted-foreground">{areaName}</p>
        </div>
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
            onChange={(e) => {
              setTouched(true);
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            maxLength={MAX}
            placeholder="What was said, decided or agreed?"
            disabled={!meetingId}
            className="min-h-32 flex-1 resize-none text-base leading-relaxed"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {saved ? (
                <span className="inline-flex items-center gap-1 font-semibold text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Saved
                </span>
              ) : (
                <>
                  <span className="tabular-nums">{draft.length}</span>/{MAX} · Ctrl+Enter saves
                </>
              )}
            </p>
            <Button type="submit" size="sm" className="gap-2" disabled={!canSave}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {mine ? 'Update note' : 'Save note'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
