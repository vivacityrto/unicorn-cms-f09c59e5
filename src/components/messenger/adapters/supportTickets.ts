import type { BadgeTone, MessengerAttachment, MessengerMessage, MessengerThread } from '../types';
import type { ClientTicketRow } from '@/components/client-portal/support-tickets/useClientTickets';
import { CLIENT_STATUS_LABEL, TYPE_LABEL, ticketRef, type TicketStatus } from '@/components/support-tickets/ticketLogic';
import type { ThreadAttachment, ThreadMessage } from '@/components/support-tickets/useTicketThread';

/**
 * Support tickets as messenger threads. A ticket keeps its own tables, status rules and reply rules; this only draws it
 * the same way as any other conversation, so a client has one place to talk to Vivacity.
 */

const PREFIX = 'ticket:';

/** A place to send the first message to support, before any ticket exists. Sending it creates the ticket. */
export const NEW_TICKET_THREAD_ID = 'support:new';

export const ticketThreadId = (ticketId: string): string => `${PREFIX}${ticketId}`;
export const ticketIdFromThreadId = (threadId: string): string | null => (threadId.startsWith(PREFIX) ? threadId.slice(PREFIX.length) : null);

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  new: 'info',
  in_progress: 'info',
  waiting: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

export const NEW_TICKET_THREAD: MessengerThread = {
  id: NEW_TICKET_THREAD_ID,
  kind: 'support',
  title: 'Contact support',
  preview: 'Ask the Vivacity team for help',
  unread: false,
  pinned: true,
};

/**
 * A ticket as a thread: "ST-12 · Title" with its status as the chip ("Received", "In progress", "Waiting for your reply",
 * "Resolved", "Closed"). A ticket is never counted as unread: the chip already says when your reply is wanted, and the
 * unread number on the bubble is for messages you have not read.
 */
export function toTicketThread(t: ClientTicketRow): MessengerThread {
  return {
    id: ticketThreadId(t.id),
    kind: 'support',
    title: `${ticketRef(t.ticket_number)} · ${t.title}`,
    preview: TYPE_LABEL[t.type] ?? 'Support',
    lastActivityAt: t.last_activity_at,
    unread: false,
    badge: { label: CLIENT_STATUS_LABEL[t.status] ?? t.status, tone: STATUS_TONE[t.status] ?? 'neutral' },
  };
}

/**
 * The ticket's visible replies as messages. Only replies a client may see are drawn (never staff notes, AI drafts or events),
 * the reporter is "You", and everyone else is "Vivacity team" (clients never learn individual staff names here).
 */
export function toTicketMessages(messages: readonly ThreadMessage[], attachments: readonly ThreadAttachment[], reporterId: string): MessengerMessage[] {
  const byMessage = new Map<string, MessengerAttachment[]>();
  for (const a of attachments) {
    if (!a.message_id) continue;
    const list = byMessage.get(a.message_id) ?? [];
    list.push({ id: a.id, name: a.file_name, mimeType: a.mime_type, size: a.size_bytes });
    byMessage.set(a.message_id, list);
  }
  return messages
    .filter((m) => m.kind === 'reply' && !m.staff_only)
    .map((m) => {
      const fromMe = m.author_id === reporterId;
      return {
        id: m.id,
        senderId: m.author_id ?? 'vivacity',
        senderName: fromMe ? 'You' : 'Vivacity team',
        senderRole: fromMe ? 'client' : 'staff',
        fromMe,
        body: m.body,
        createdAt: m.created_at,
        attachments: byMessage.get(m.id) ?? [],
      };
    });
}
