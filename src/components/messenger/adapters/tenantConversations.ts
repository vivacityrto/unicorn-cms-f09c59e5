import type { ConversationMessage, ConversationThread } from '@/hooks/useClientCommunications';
import type { MessengerMessage, MessengerPerson, MessengerThread, ThreadKind } from '../types';

/**
 * Turns the portal's conversation rows (tenant_conversations, tenant_messages) into the messenger's shapes.
 * Pure functions only, so the mapping is tested without a database. Used by the client Inbox, and by the bubble and the
 * staff views as they move onto the kit.
 */

const KINDS: readonly ThreadKind[] = ['csc', 'broadcast', 'package', 'task', 'rock', 'direct', 'general'];

/** A conversation's `type`, as one of the messenger's thread kinds. Anything unknown is a general conversation. */
export function conversationKind(type: string | null | undefined): ThreadKind {
  return (KINDS as readonly string[]).includes(type ?? '') ? (type as ThreadKind) : 'general';
}

export function conversationTitle(c: Pick<ConversationThread, 'subject' | 'topic'>): string {
  return c.subject || c.topic || 'General';
}

export function toMessengerThread(c: ConversationThread): MessengerThread {
  return {
    id: c.id,
    kind: conversationKind(c.type),
    title: conversationTitle(c),
    preview: c.last_message_preview,
    lastActivityAt: c.last_message_at,
    unread: c.isUnread,
    myLastReadAt: c.myLastReadAt,
  };
}

/**
 * One message for the messenger. `staff` comes only from the database's answer (`sender_is_staff`), never from the
 * message's own sender_type, which the sender writes. A message with no sender still shows.
 */
export function toMessengerMessage(m: ConversationMessage, currentUserId: string | null): MessengerMessage {
  const fromMe = !!currentUserId && m.sender_id === currentUserId;
  return {
    id: m.id,
    senderId: m.sender_id ?? 'unknown',
    senderName: fromMe ? 'You' : m.sender_name || 'Unknown',
    senderAvatarUrl: m.sender_avatar_url,
    senderRole: m.sender_is_staff ? 'staff' : 'client',
    fromMe,
    body: m.body ?? '',
    createdAt: m.created_at,
    attachments: (m.attachments ?? []).map((a) => ({ id: a.id, name: a.filename, mimeType: a.mime_type, size: a.file_size })),
  };
}

/** A message that is being sent, drawn straight away with "Sending…" until the saved copy arrives. */
export function pendingMessage(id: string, body: string, userId: string, files: readonly File[]): MessengerMessage {
  return {
    id,
    senderId: userId,
    senderName: 'You',
    senderRole: 'client',
    fromMe: true,
    body,
    createdAt: new Date().toISOString(),
    attachments: files.map((f, i) => ({ id: `${id}-f${i}`, name: f.name, mimeType: f.type || null, size: f.size })),
    delivery: 'sending',
  };
}

interface ParticipantRow { user_id: string | null; last_read_at: string | null }

/** Other people in the conversation with when they last read it, for "Seen". Rows without a person are dropped. */
export function toPeople(rows: readonly ParticipantRow[], names: ReadonlyMap<string, { name: string; avatarUrl: string | null; isStaff: boolean | null }>): MessengerPerson[] {
  return rows
    .filter((r): r is { user_id: string; last_read_at: string | null } => !!r.user_id)
    .map((r) => {
      const n = names.get(r.user_id);
      return { id: r.user_id, name: n?.name ?? 'Someone', avatarUrl: n?.avatarUrl ?? null, role: n?.isStaff ? 'staff' : 'client', lastReadAt: r.last_read_at };
    });
}
