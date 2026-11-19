import { describe, expect, it } from 'vitest';
import { NEW_TICKET_THREAD_ID, attachmentsByMessageId, ticketIdFromThreadId, ticketThreadId, toTicketMessages, toTicketThread } from '../adapters/supportTickets';
import type { ClientTicketRow } from '@/components/client-portal/support-tickets/useClientTickets';
import type { ThreadAttachment, ThreadMessage } from '@/components/support-tickets/useTicketThread';

const ticket = (over: Partial<ClientTicketRow> = {}): ClientTicketRow => ({ id: 't1', ticket_number: 12, title: 'Cannot upload evidence', type: 'bug', status: 'in_progress', created_at: '2026-11-18T00:00:00Z', last_activity_at: '2026-11-19T01:00:00Z', reporter_id: 'me', ...over });
const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({ id: 'm1', ticket_id: 't1', author_id: 'me', kind: 'reply', staff_only: false, body: 'Hello', created_at: '2026-11-19T01:00:00Z', ...over });

describe('ticket threads', () => {
  it('maps a ticket to a support thread with its reference, title and a plain status chip', () => {
    expect(toTicketThread(ticket())).toMatchObject({ id: 'ticket:t1', kind: 'support', title: 'ST-12 · Cannot upload evidence', preview: expect.any(String), lastActivityAt: '2026-11-19T01:00:00Z', badge: { label: 'In progress', tone: 'info' } });
  });

  it('says when your reply is wanted, and when it is resolved or closed', () => {
    expect(toTicketThread(ticket({ status: 'waiting' })).badge).toEqual({ label: 'Waiting for your reply', tone: 'warning' });
    expect(toTicketThread(ticket({ status: 'resolved' })).badge?.tone).toBe('success');
    expect(toTicketThread(ticket({ status: 'closed' })).badge?.tone).toBe('neutral');
    expect(toTicketThread(ticket({ status: 'new' })).badge?.label).toBe('Received');
  });

  it('is never counted as unread (the chip carries "waiting for your reply")', () => {
    expect(toTicketThread(ticket({ status: 'waiting' })).unread).toBe(false);
  });

  it('round trips the thread id and rejects ids that are not tickets', () => {
    expect(ticketIdFromThreadId(ticketThreadId('abc'))).toBe('abc');
    expect(ticketIdFromThreadId('csc:new')).toBeNull();
    expect(ticketIdFromThreadId(NEW_TICKET_THREAD_ID)).toBeNull();
  });
});

describe('ticket messages', () => {
  it('shows you as You and everyone else as the Vivacity team, never a staff name', () => {
    const out = toTicketMessages([msg({ id: 'a' }), msg({ id: 'b', author_id: 'staff9' })], [], 'me');
    expect(out.map((m) => [m.id, m.fromMe, m.senderName, m.senderRole])).toEqual([['a', true, 'You', 'client'], ['b', false, 'Vivacity team', 'staff']]);
  });

  it('draws only replies a client may see: no staff notes, AI drafts or events', () => {
    const out = toTicketMessages([msg({ id: 'ok' }), msg({ id: 'note', staff_only: true }), msg({ id: 'ai', kind: 'ai_draft' }), msg({ id: 'ev', kind: 'event' })], [], 'me');
    expect(out.map((m) => m.id)).toEqual(['ok']);
  });

  const att = (id: string, message_id: string | null): ThreadAttachment => ({ id, ticket_id: 't1', message_id, bucket: 'ticket-files', storage_path: 'p', file_name: `${id}.png`, mime_type: 'image/png', size_bytes: 5, created_at: 'x' });

  it('attaches files to the reply they were sent with', () => {
    const out = toTicketMessages([msg({ id: 'm1' }), msg({ id: 'm2', created_at: '2026-11-19T02:00:00Z' })], [att('a2', 'm2')], 'me');
    expect(out.find((m) => m.id === 'm2')?.attachments).toEqual([{ id: 'a2', name: 'a2.png', mimeType: 'image/png', size: 5 }]);
    expect(out.find((m) => m.id === 'm1')?.attachments).toEqual([]);
  });

  it('shows files sent when the ticket was created (no message id) on the first reply, so the original screenshot is never lost', () => {
    const messages = [msg({ id: 'later', created_at: '2026-11-19T05:00:00Z' }), msg({ id: 'first', created_at: '2026-11-19T01:00:00Z' })];
    const out = toTicketMessages(messages, [att('shot1', null), att('shot2', null), att('r', 'later')], 'me');
    expect(out.find((m) => m.id === 'first')?.attachments?.map((a) => a.id)).toEqual(['shot1', 'shot2']);
    expect(out.find((m) => m.id === 'later')?.attachments?.map((a) => a.id)).toEqual(['r']);
    expect([...attachmentsByMessageId(messages, [att('shot1', null)]).keys()]).toEqual(['first']);
  });

  it('draws nothing for creation files when the ticket has no visible reply yet', () => {
    expect(attachmentsByMessageId([], [att('shot', null)]).size).toBe(0);
    expect(attachmentsByMessageId([msg({ id: 'n', staff_only: true })], [att('shot', null)]).size).toBe(0);
  });
});
