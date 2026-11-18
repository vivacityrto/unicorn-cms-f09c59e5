import { useEffect, useState } from 'react';
import { Loader2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSaveScorecardNote, type ScorecardNote } from '@/features/eos-scorecard/useScorecardDiscussion';

interface AreaNotesProps {
  category: string;
  areaName: string;
  meetingId?: string;
  notes: readonly ScorecardNote[];
  myUserId: string | null;
  ownerNames: Readonly<Record<string, string>>;
  onSaved: () => void;
}

/** Notes for one area in this meeting. Your own is editable; everyone else's is read-only. */
export function AreaNotes({ category, areaName, meetingId, notes, myUserId, ownerNames, onSaved }: AreaNotesProps) {
  const save = useSaveScorecardNote(meetingId);
  const mine = notes.find((n) => n.category === category && n.createdBy === myUserId);
  const others = notes.filter((n) => n.category === category && n.createdBy !== myUserId);
  const [draft, setDraft] = useState(mine?.body ?? '');
  // Pick up the saved note when it first arrives, without overwriting what is being typed.
  const [seeded, setSeeded] = useState(!!mine);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (mine && !seeded && !touched) {
      setDraft(mine.body);
      setSeeded(true);
    }
  }, [mine, seeded, touched]);

  const dirty = draft.trim() !== (mine?.body ?? '');
  const submit = async () => {
    try {
      await save.mutateAsync({ category, body: draft });
      onSaved();
    } catch {
      // The mutation has already said what went wrong; the text stays.
    }
  };

  return (
    <section aria-label={`Notes for ${areaName}`} className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <NotebookPen className="h-4 w-4" aria-hidden />
        Notes for this meeting
      </h3>
      {others.length > 0 && (
        <ul className="space-y-1.5">
          {others.map((n) => (
            <li key={n.id} className="rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
              <span className="block text-xs font-semibold text-muted-foreground">{ownerNames[n.createdBy] ?? 'A colleague'}</span>
              <span className="whitespace-pre-wrap break-words">{n.body}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor={`area-note-${category}`} className="sr-only">
          Your note for {areaName}
        </Label>
        <Textarea
          id={`area-note-${category}`}
          value={draft}
          onChange={(e) => {
            setTouched(true);
            setDraft(e.target.value);
          }}
          rows={3}
          maxLength={5000}
          placeholder="What was said, decided or agreed?"
          disabled={!meetingId}
        />
        <Button type="submit" size="sm" className="gap-2" disabled={!meetingId || !dirty || !draft.trim() || save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {mine ? 'Update note' : 'Save note'}
        </Button>
      </form>
    </section>
  );
}
