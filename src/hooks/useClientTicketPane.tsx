import { useCallback, useMemo, useRef, useState } from 'react';
import { AttachmentList } from '@/components/support-tickets/AttachmentParts';
import type { MessengerMessage } from '@/components/messenger';
import { attachmentsByMessageId, toTicketMessages } from '@/components/messenger/adapters/supportTickets';
import { pendingMessage } from '@/components/messenger/adapters/tenantConversations';
import type { ClientTicketRow } from '@/components/client-portal/support-tickets/useClientTickets';
import { usePostReply, useTicketThread, validateAttachment as validateTicketFile } from '@/components/support-tickets/useTicketThread';
import { useAuth } from '@/hooks/useAuth';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import type { ClientConversationPane } from '@/hooks/useClientConversationPane';

export const TICKET_ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt';

interface Options {
  /**
   * Replaces the normal reply. Used by "Contact support" before a ticket exists: the first message creates the ticket.
   * May throw to keep the text in the box.
   */
  sendOverride?: (message: { body: string; files: File[] }) => Promise<void>;
}

/**
 * Everything the messenger needs to show and work one of the client's own support tickets: the replies a client may see,
 * a "Sending…" bubble while a reply goes, and attachments. Replies use the ticket's own reply rules (a reply to a resolved
 * or closed ticket reopens it). Pass no ticket for "Contact support", which has no messages yet.
 */
export function useClientTicketPane(ticket: ClientTicketRow | null, { sendOverride }: Options = {}): ClientConversationPane {
  const { user } = useAuth();
  const { isReadOnly } = useClientTenant();
  const me = user?.id ?? null;
  const [pending, setPending] = useState<MessengerMessage[]>([]);
  const counter = useRef(0);
  const ticketId = ticket?.id;

  const { data: thread, isLoading } = useTicketThread(ticketId, { includeAuthors: false });
  const post = usePostReply(ticketId);

  const messages = useMemo(() => {
    const saved = ticket ? toTicketMessages(thread?.messages ?? [], thread?.attachments ?? [], ticket.reporter_id) : [];
    const inFlight = pending.filter((p) => p.id.startsWith(`pending-${ticketId ?? 'new'}-`));
    return [...saved, ...inFlight];
  }, [thread, pending, ticket, ticketId]);

  // Includes the files sent with the first message, which have no message id of their own.
  const attachmentsByMessage = useMemo(() => attachmentsByMessageId(thread?.messages ?? [], thread?.attachments ?? []), [thread]);

  const onSend = useCallback(
    async ({ body, files }: { body: string; files: File[] }) => {
      if (!me) return;
      const pendingId = `pending-${ticketId ?? 'new'}-${(counter.current += 1)}`;
      setPending((prev) => [...prev, pendingMessage(pendingId, body, me, files)]);
      try {
        if (sendOverride) await sendOverride({ body, files });
        else await post.mutateAsync({ body, staffOnly: false, files });
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== pendingId));
      }
    },
    [me, ticketId, sendOverride, post],
  );

  const renderAttachments = useCallback(
    (m: MessengerMessage) => {
      const list = attachmentsByMessage.get(m.id);
      return list && list.length > 0 ? <AttachmentList attachments={list} /> : null;
    },
    [attachmentsByMessage],
  );

  return {
    messages,
    isLoading: !!ticketId && isLoading,
    draftScope: 'client-support',
    capabilities: { canSend: !isReadOnly, showSeen: false },
    onSend,
    validateFile: validateTicketFile,
    accept: TICKET_ATTACHMENT_ACCEPT,
    maxFiles: 3,
    renderAttachments,
    composerPlaceholder: ticket ? 'Write a reply' : 'Tell us what you need help with',
    empty: (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {ticket ? 'No messages on this ticket yet.' : 'Tell us what you were trying to do and what happened. A person from the Vivacity team will reply here.'}
      </p>
    ),
  };
}
