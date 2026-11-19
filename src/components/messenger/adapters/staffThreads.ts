import type { BadgeTone, MessengerThread } from '../types';
import { conversationKind } from './tenantConversations';

/** One row of public.get_my_message_scope(): a client organisation that is mine, and why. */
export interface StaffScopeRow {
  tenant_id: number;
  reason: string;
  covering_user_id: string | null;
  covering_name: string | null;
}

export interface StaffConversationRow {
  id: string;
  tenant_id: number;
  subject: string | null;
  topic: string | null;
  type: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
}

interface BuildInput {
  conversations: readonly StaffConversationRow[];
  /** Mine, by the notification routing. Keyed by organisation. */
  scope: ReadonlyMap<number, StaffScopeRow>;
  tenantNames: ReadonlyMap<number, string>;
  /** Conversation ids that have an unread message notification for this person. */
  unreadConversationIds: ReadonlySet<string>;
  /** When this person last read each conversation they are in. */
  myReadAt: ReadonlyMap<string, string | null>;
  /** For each conversation, when the oldest unread message notification arrived. */
  unreadSince?: ReadonlyMap<string, string>;
}

const firstName = (name: string | null) => (name ?? '').split(/\s+/)[0] || null;

/** The short chip that says why a thread is in my list. My own clients need none. */
export function scopeBadge(row: StaffScopeRow | undefined): { label: string; tone: BadgeTone } | undefined {
  if (!row) return undefined;
  switch (row.reason) {
    case 'delegate':
      return { label: firstName(row.covering_name) ? `Covering ${firstName(row.covering_name)}` : 'Covering', tone: 'info' };
    case 'watching':
      return { label: 'Watching', tone: 'neutral' };
    case 'unassigned':
      return { label: 'Unassigned', tone: 'warning' };
    default:
      return undefined;
  }
}

/**
 * The staff bubble's conversations as messenger threads: the organisation's name leads, a chip says why it is mine (covering
 * a colleague, watching, unassigned), and only conversations that are mine can be unread, because unread comes from the
 * message notifications the routing sent me. A thread outside my scope (seen through "All clients") is never unread.
 */
export function buildStaffThreads({ conversations, scope, tenantNames, unreadConversationIds, myReadAt, unreadSince }: BuildInput): MessengerThread[] {
  return conversations.map((c) => {
    const row = scope.get(c.tenant_id);
    const org = tenantNames.get(c.tenant_id) ?? `Client ${c.tenant_id}`;
    const subject = c.subject || c.topic || 'General';
    const unread = !!row && unreadConversationIds.has(c.id);
    return {
      id: c.id,
      kind: conversationKind(c.type, c.topic),
      title: `${org} · ${subject}`,
      tenantId: c.tenant_id,
      preview: c.last_message_preview,
      lastActivityAt: c.last_message_at,
      unread,
      unreadSince: unread ? unreadSince?.get(c.id) ?? null : null,
      badge: scopeBadge(row),
      myLastReadAt: myReadAt.get(c.id) ?? null,
    };
  });
}
