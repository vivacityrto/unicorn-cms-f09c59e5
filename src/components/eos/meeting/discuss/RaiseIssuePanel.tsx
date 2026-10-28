import { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useRaiseRockIssue, type LinkedIssue } from '@/hooks/useRockDiscussion';
import { draftIssue, isOpenIssue, type IssueDraftInput, type IssueSuggestion } from '@/utils/rockDiscussion';

interface RaiseIssuePanelProps {
  rockId: string;
  suggestion: IssueSuggestion;
  draft: IssueDraftInput;
  existing: LinkedIssue[];
  /** Raised from this view in this meeting. */
  raisedNow: boolean;
  meeting?: { id?: string; segmentId?: string; type?: string | null };
  onRaised: () => void;
}

const HEADLINE: Record<IssueSuggestion, string> = {
  strong: 'This one needs the room',
  consider: 'Does this need the room?',
  none: 'Anything to raise?',
};

/**
 * Hand a problem to IDS without solving it here. The issue is drafted from the Rock's own facts
 * and linked to the Rock and the meeting, so it lands in the IDS queue ready to discuss. A Rock
 * that already has an open issue shows it first and asks for a deliberate second one.
 */
export function RaiseIssuePanel({ rockId, suggestion, draft, existing, raisedNow, meeting, onRaised }: RaiseIssuePanelProps) {
  const raise = useRaiseRockIssue();
  const open = existing.filter(issue => isOpenIssue(issue.status));
  const [expanded, setExpanded] = useState(suggestion === 'strong' && open.length === 0);
  const [note, setNote] = useState('');
  const [editedTitle, setEditedTitle] = useState<string | null>(null);

  const drafted = draftIssue({ ...draft, note });
  const title = editedTitle ?? drafted.title;

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await raise.mutateAsync({
        title,
        description: drafted.description,
        rockId,
        meetingId: meeting?.id,
        meetingSegmentId: meeting?.segmentId,
        meetingType: meeting?.type,
      });
      setExpanded(false);
      setNote('');
      setEditedTitle(null);
      onRaised();
    } catch {
      // The mutation has already said what went wrong; the form stays so nothing typed is lost.
    }
  };

  return (
    <section aria-label="Raise an issue" className={cn('space-y-2 rounded-xl border p-3', suggestion === 'strong' && !raisedNow ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20' : 'bg-card')}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareWarning className="h-4 w-4" aria-hidden />
        {HEADLINE[suggestion]}
      </h3>

      {raisedNow && (
        <p role="status" className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Added to the IDS queue. It will be discussed there, not here.
        </p>
      )}

      {open.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Already waiting for IDS</p>
          <ul className="space-y-1">
            {open.map(issue => (
              <li key={issue.id} className="flex items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
                <span className="min-w-0 break-words">{issue.title}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">{issue.status ?? 'Open'}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!expanded ? (
        <Button type="button" variant={suggestion === 'strong' && open.length === 0 ? 'default' : 'outline'} className="h-10 w-full gap-2" onClick={() => setExpanded(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {open.length > 0 || raisedNow ? 'Raise another issue' : 'Raise it for IDS'}
        </Button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`issue-title-${rockId}`}>Issue</Label>
            <Input id={`issue-title-${rockId}`} value={title} onChange={event => setEditedTitle(event.target.value)} maxLength={140} required aria-required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`issue-note-${rockId}`}>What does the room need to decide? (optional, the Rock’s facts are added for you)</Label>
            <Textarea id={`issue-note-${rockId}`} value={note} onChange={event => setNote(event.target.value)} rows={1} maxLength={500} placeholder="e.g. Do we add budget, or move the date?" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="h-10 flex-1 gap-2" disabled={raise.isPending || !title.trim()}>
              {raise.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Add to IDS queue
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={() => setExpanded(false)} disabled={raise.isPending}>Not now</Button>
          </div>
        </form>
      )}
    </section>
  );
}
