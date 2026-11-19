import { describe, expect, it } from 'vitest';
import { conversationKind, conversationTitle, pendingMessage, toMessengerMessage, toMessengerThread, toPeople } from '../adapters/tenantConversations';
import type { ConversationMessage, ConversationThread } from '@/hooks/useClientCommunications';

const thread = (over: Partial<ConversationThread> = {}): ConversationThread =>
  ({ id: 'c1', tenant_id: 1, subject: 'Package question', topic: 'package', type: 'package', last_message_at: '2026-11-19T01:00:00Z', last_message_preview: 'Thanks', created_at: '2026-11-18T00:00:00Z', status: 'open', isUnread: true, myLastReadAt: '2026-11-18T05:00:00Z', ...over }) as ConversationThread;

const message = (over: Partial<ConversationMessage> = {}): ConversationMessage =>
  ({ id: 'm1', conversation_id: 'c1', sender_id: 'staff1', sender_type: 'staff', body: 'Hello', created_at: '2026-11-19T01:00:00Z', sender_name: 'Nova Canto', sender_avatar_url: null, sender_is_staff: true, attachments: [], ...over });

describe('tenant conversations to messenger threads', () => {
  it('maps known types to kinds and anything else to general', () => {
    for (const k of ['csc', 'broadcast', 'package', 'task', 'rock', 'direct', 'general']) expect(conversationKind(k)).toBe(k);
    expect(conversationKind('something_new')).toBe('general');
    expect(conversationKind(null)).toBe('general');
    // A conversation with the consultant is a csc thread however it was created.
    expect(conversationKind('direct', 'csc')).toBe('csc');
    expect(conversationKind('general', 'general')).toBe('general');
  });

  it('titles a conversation by subject, then topic, then General', () => {
    expect(conversationTitle({ subject: 'S', topic: 'T' })).toBe('S');
    expect(conversationTitle({ subject: null, topic: 'T' })).toBe('T');
    expect(conversationTitle({ subject: null, topic: null })).toBe('General');
  });

  it('carries unread state, the read position and the last activity, leaving a never-used thread without a time', () => {
    expect(toMessengerThread(thread())).toMatchObject({ id: 'c1', kind: 'package', title: 'Package question', preview: 'Thanks', unread: true, myLastReadAt: '2026-11-18T05:00:00Z', lastActivityAt: '2026-11-19T01:00:00Z' });
    expect(toMessengerThread(thread({ last_message_at: null, last_message_preview: null })).lastActivityAt).toBeNull();
  });
});

describe('messages', () => {
  it('marks your own messages and calls you "You"', () => {
    expect(toMessengerMessage(message({ sender_id: 'me' }), 'me')).toMatchObject({ fromMe: true, senderName: 'You' });
    expect(toMessengerMessage(message(), 'me')).toMatchObject({ fromMe: false, senderName: 'Nova Canto', senderRole: 'staff' });
  });

  it('takes staff only from the database answer, never from what the message says about itself', () => {
    const forged = message({ sender_type: 'staff', sender_is_staff: false });
    expect(toMessengerMessage(forged, 'me').senderRole).toBe('client');
    expect(toMessengerMessage(message({ sender_is_staff: undefined }), 'me').senderRole).toBe('client');
  });

  it('still shows a message with no sender or name, and with no signed-in person', () => {
    const odd = toMessengerMessage(message({ sender_id: null as unknown as string, sender_name: undefined }), null);
    expect(odd).toMatchObject({ senderId: 'unknown', senderName: 'Unknown', fromMe: false });
  });

  it('describes attachments by name for the host to draw', () => {
    const m = toMessengerMessage(message({ attachments: [{ id: 'a1', message_id: 'm1', storage_path: 'p', filename: 'plan.pdf', mime_type: 'application/pdf', file_size: 10, created_at: 'x' }] }), 'me');
    expect(m.attachments).toEqual([{ id: 'a1', name: 'plan.pdf', mimeType: 'application/pdf', size: 10 }]);
  });

  it('builds a message that is still sending', () => {
    const p = pendingMessage('pending-c1-1', 'Hi', 'me', [new File(['x'], 'a.png', { type: 'image/png' })]);
    expect(p).toMatchObject({ fromMe: true, delivery: 'sending', body: 'Hi', senderId: 'me' });
    expect(p.attachments?.[0].name).toBe('a.png');
  });
});

describe('people for Seen', () => {
  it('names people from profiles, marks staff and drops rows with no person', () => {
    const names = new Map([['u1', { name: 'Nova Canto', avatarUrl: null, isStaff: true }]]);
    const people = toPeople([{ user_id: 'u1', last_read_at: '2026-11-19T02:00:00Z' }, { user_id: null, last_read_at: null }, { user_id: 'u2', last_read_at: null }], names);
    expect(people).toEqual([
      { id: 'u1', name: 'Nova Canto', avatarUrl: null, role: 'staff', lastReadAt: '2026-11-19T02:00:00Z' },
      { id: 'u2', name: 'Someone', avatarUrl: null, role: 'client', lastReadAt: null },
    ]);
  });
});
