import { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { issueDraft, type Measure } from '@/features/eos-scorecard/scorecardView';
import { useRaiseScorecardIssue, type MetricIssue } from '@/features/eos-scorecard/useScorecardDiscussion';
import { isOpenIssue } from '@/utils/rockDiscussion';

interface RaiseMeasureIssueProps {
  measure: Measure;
  weekKey: string;
  ownerName: string | null;
  /** Issues already raised for this measure. */
  existing: readonly MetricIssue[];
  existingState: 'loading' | 'error' | 'ready';
  raisedNow: boolean;
  meeting?: { id?: string; segmentId?: string; type?: string | null };
  onRaised: () => void;
}

/**
 * Hand a problem to IDS without solving it here. The issue is drafted from the measure's own numbers and
 * linked to the measure and the meeting. A measure with an open issue shows it first and asks for a deliberate second one.
 */
export function RaiseMeasureIssue({ measure, weekKey, ownerName, existing, existingState, raisedNow, meeting, onRaised }: RaiseMeasureIssueProps) {
  const raise = useRaiseScorecardIssue();
  const open = existing.filter((i) => isOpenIssue(i.status));
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const drafted = issueDraft(measure, weekKey, note, ownerName);
  const title = editedTitle ?? drafted.title;

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await raise.mutateAsync({
        title,
        description: drafted.description,
        metricId: measure.id,
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
    <div className="min-w-[7.5rem] flex-1 space-y-1.5" aria-label={`Raise an issue about ${measure.name}`}>
      {raisedNow && (
        <p role="status" className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Added to the IDS queue. It will be discussed there, not here.
        </p>
      )}
      {existingState === 'error' && <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">Could not check for issues already raised. Look in IDS before raising another.</p>}
      {open.length > 0 && (
        <ul className="space-y-1">
          {open.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
              <span className="min-w-0 break-words">{i.title}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">{i.status ?? 'Open'}</Badge>
            </li>
          ))}
        </ul>
      )}
      {/* The form opens over the card rather than inside it, so raising an issue never pushes the slide taller. */}
      <Popover open={expanded} onOpenChange={setExpanded}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 whitespace-nowrap px-2 text-xs" disabled={existingState === 'loading'}>
            {open.length > 0 || raisedNow ? <Plus className="h-4 w-4" aria-hidden /> : <MessageSquareWarning className="h-4 w-4" aria-hidden />}
            {open.length > 0 || raisedNow ? 'Raise another issue' : 'Raise it for IDS'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,24rem)] space-y-0 p-3">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`issue-title-${measure.id}`}>Issue</Label>
              <Input id={`issue-title-${measure.id}`} value={title} onChange={(e) => setEditedTitle(e.target.value)} maxLength={140} required aria-required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`issue-note-${measure.id}`}>What does the room need to decide? (optional, the numbers are added for you)</Label>
              <Textarea id={`issue-note-${measure.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Do we change the aim, or fix what is behind it?" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1 gap-2" disabled={raise.isPending || !title.trim()}>
                {raise.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Add to IDS queue
              </Button>
              <Button type="button" variant="ghost" onClick={() => setExpanded(false)} disabled={raise.isPending}>Not now</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
