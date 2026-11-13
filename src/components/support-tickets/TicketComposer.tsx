import { useId, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AttachmentPicker } from './AttachmentParts';
import { usePostReply } from './useTicketThread';

/**
 * Reply box. Staff can switch between a reply the reporter sees and a note only
 * staff see; clients only ever get the reply mode.
 */
export function TicketComposer({
  ticketId, canNote, placeholder = 'Write your reply', hint,
}: { ticketId: string; canNote: boolean; placeholder?: string; hint?: string }) {
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const post = usePostReply(ticketId);
  const fieldId = useId();
  const staffOnly = canNote && mode === 'note';
  const canSend = body.trim().length > 0 && !post.isPending;

  const send = () => {
    if (!canSend) return;
    post.mutate(
      { body: body.trim(), staffOnly, files },
      { onSuccess: () => { setBody(''); setFiles([]); } },
    );
  };

  return (
    <form
      className={cn('space-y-2 rounded-lg border p-3', staffOnly ? 'border-brand-macaron bg-brand-macaron/10' : 'border-border bg-card')}
      onSubmit={(e) => { e.preventDefault(); send(); }}
    >
      {canNote && (
        <div role="radiogroup" aria-label="Message type" className="inline-flex rounded-md border border-border bg-background p-0.5">
          {([['reply', 'Reply to reporter'], ['note', 'Add staff-only note']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'min-h-11 rounded px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8',
                mode === value ? 'bg-brand-purple text-white' : 'text-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Label htmlFor={fieldId} className="sr-only">{staffOnly ? 'Staff-only note' : 'Reply'}</Label>
      <Textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } }}
        placeholder={staffOnly ? 'Only Vivacity staff can see this note' : placeholder}
        rows={3}
        maxLength={10000}
        disabled={post.isPending}
      />
      {(staffOnly || hint) && (
        <p className="text-xs text-muted-foreground">{staffOnly ? 'This note is hidden from the reporter.' : hint}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AttachmentPicker files={files} onChange={setFiles} disabled={post.isPending} />
        <Button type="submit" disabled={!canSend} className="min-h-11 gap-1.5 sm:min-h-9">
          {post.isPending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
          {staffOnly ? 'Save note' : 'Send reply'}
        </Button>
      </div>
      {!canSend && !post.isPending && body.length === 0 && (
        <p className="sr-only">Type a message to enable sending.</p>
      )}
    </form>
  );
}
