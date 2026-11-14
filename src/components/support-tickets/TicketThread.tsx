import { EyeOff, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttachmentList } from './AttachmentParts';
import { authorLabel, formatDateTime, type ThreadViewer } from './ticketLogic';
import type { ThreadAttachment, ThreadMessage } from './useTicketThread';

/** The note body starts with its own heading line; the label above already says it. */
const AI_NOTE_HEADING = /^AI summary \(draft[^\n]*\n/;

export function TicketThread({
  messages, attachments, reporterId, viewer,
}: {
  messages: ThreadMessage[];
  attachments: ThreadAttachment[];
  reporterId: string;
  viewer: ThreadViewer;
}) {
  const byMessage = new Map<string, ThreadAttachment[]>();
  const ticketLevel: ThreadAttachment[] = [];
  for (const a of attachments) {
    if (!a.message_id) { ticketLevel.push(a); continue; }
    byMessage.set(a.message_id, [...(byMessage.get(a.message_id) ?? []), a]);
  }

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet.</p>;
  }

  return (
    <div>
      {ticketLevel.length > 0 && (
        <section aria-label="Files on this ticket" className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files</h3>
          <AttachmentList attachments={ticketLevel} />
        </section>
      )}
      <ol aria-label="Ticket thread" className="space-y-3">
        {messages.map((m) => {
          if (m.kind === 'event') {
            return (
              <li key={m.id} className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                {m.staff_only && viewer === 'staff' && <EyeOff aria-hidden className="h-3 w-3" />}
                <span className="whitespace-pre-line">{m.body}</span>
                <span aria-hidden>·</span>
                <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
              </li>
            );
          }
          const isDraft = m.kind === 'ai_draft';
          const isNote = m.kind === 'reply' && m.staff_only;
          const mine = viewer === 'client' && m.author_id === reporterId;
          return (
            <li
              key={m.id}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-sm text-foreground',
                isDraft && 'border-primary/40 bg-primary/5',
                isNote && 'border-brand-macaron bg-brand-macaron/10',
                !isDraft && !isNote && (mine ? 'border-brand-purple/30 bg-brand-purple/5' : 'border-border bg-card'),
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {isDraft ? 'AI summary (draft)' : authorLabel(m, viewer, reporterId)}
                </span>
                {isDraft && (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles aria-hidden className="h-3 w-3" /> AI-generated, check before relying on it
                  </span>
                )}
                {(isNote || isDraft) && (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <EyeOff aria-hidden className="h-3 w-3" /> Staff only
                  </span>
                )}
                <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
              </div>
              <p className="whitespace-pre-wrap break-words">{isDraft ? m.body.replace(AI_NOTE_HEADING, "") : m.body}</p>
              <AttachmentList attachments={byMessage.get(m.id) ?? []} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
