import { describe, expect, it } from 'vitest';
import { ASK_VIV_THREAD_ID, HELP_ALIAS_CSC, HELP_ALIAS_SUPPORT, NEW_CSC_THREAD_ID, NEW_TICKET_THREAD_ID, buildClientThreads, resolveHelpAlias } from '../clientThreads';
import type { ConversationThread } from '@/hooks/useClientCommunications';
import type { ClientTicketRow } from '@/components/client-portal/support-tickets/useClientTickets';

const conv = (over: Partial<ConversationThread>): ConversationThread =>
  ({ id: 'c', tenant_id: 1, subject: 'S', topic: 'general', type: 'general', last_message_at: '2026-11-19T01:00:00Z', last_message_preview: 'p', created_at: '2026-11-18T00:00:00Z', status: 'open', isUnread: false, myLastReadAt: null, ...over }) as ConversationThread;

const ticket = (over: Partial<ClientTicketRow> = {}): ClientTicketRow => ({ id: 't1', ticket_number: 7, title: 'Cannot log in', type: 'bug', status: 'new', created_at: '2026-11-18T00:00:00Z', last_activity_at: '2026-11-19T02:00:00Z', reporter_id: 'me', ...over });

const base = { conversations: [] as ConversationThread[], cscName: null, cscAvatarUrl: null, hasCsc: false };

describe('the client messenger thread list', () => {
  it('starts with Ask Viv, pinned and never unread', () => {
    const [first] = buildClientThreads(base);
    expect(first).toMatchObject({ id: ASK_VIV_THREAD_ID, kind: 'ask_viv', pinned: true, unread: false });
  });

  it('always offers Contact support, so there is somewhere to start a ticket', () => {
    const ids = buildClientThreads(base).map((t) => t.id);
    expect(ids).toEqual([ASK_VIV_THREAD_ID, NEW_TICKET_THREAD_ID]);
  });

  it('offers a place to start a conversation with the consultant when one is assigned and none exists yet', () => {
    const threads = buildClientThreads({ ...base, conversations: [conv({ id: 'a' })], cscName: 'Nova Canto', hasCsc: true });
    expect(threads.find((t) => t.id === NEW_CSC_THREAD_ID)).toMatchObject({ kind: 'csc', title: 'Nova Canto', pinned: true });
  });

  it('uses the most recent conversation with the consultant as the consultant thread, however it was created', () => {
    const threads = buildClientThreads({
      ...base,
      conversations: [
        conv({ id: 'old', topic: 'csc', type: 'direct', last_message_at: '2026-11-01T00:00:00Z' }),
        conv({ id: 'new', topic: 'csc', type: 'direct', last_message_at: '2026-11-18T00:00:00Z', isUnread: true }),
        conv({ id: 'other', topic: 'general', type: 'package' }),
      ],
      cscName: 'Nova Canto',
      cscAvatarUrl: 'x.png',
      hasCsc: true,
    });
    expect(threads.find((t) => t.id === NEW_CSC_THREAD_ID)).toBeUndefined();
    expect(threads.find((t) => t.id === 'new')).toMatchObject({ pinned: true, title: 'Nova Canto', avatarUrl: 'x.png', unread: true });
    expect(threads.find((t) => t.id === 'old')?.pinned).toBeFalsy();
    expect(threads.find((t) => t.id === 'other')?.pinned).toBeFalsy();
  });

  it('lists the person\'s own support tickets as support threads with their status', () => {
    const threads = buildClientThreads({ ...base, tickets: [ticket({ status: 'waiting' })] });
    expect(threads.find((t) => t.id === 'ticket:t1')).toMatchObject({ kind: 'support', title: 'ST-7 · Cannot log in', badge: { label: 'Waiting for your reply', tone: 'warning' } });
  });

  it('gives academy-only people only tickets they already have: no Ask Viv, no conversations, and no way to start a ticket (the database refuses it)', () => {
    const threads = buildClientThreads({ ...base, conversations: [conv({ id: 'a' })], tickets: [ticket()], cscName: 'Nova', hasCsc: true, academyOnly: true });
    expect(threads.map((t) => t.id)).toEqual(['ticket:t1']);
    expect(buildClientThreads({ ...base, academyOnly: true })).toEqual([]);
  });
});

describe('the old Help Center buttons', () => {
  it('"Support" opens Contact support', () => {
    expect(resolveHelpAlias(HELP_ALIAS_SUPPORT, buildClientThreads(base))).toBe(NEW_TICKET_THREAD_ID);
  });

  it('"Message your CSC" opens the real consultant conversation, or the place to start one', () => {
    const withReal = buildClientThreads({ ...base, conversations: [conv({ id: 'real', topic: 'csc', type: 'direct' })], hasCsc: true });
    expect(resolveHelpAlias(HELP_ALIAS_CSC, withReal)).toBe('real');
    const none = buildClientThreads({ ...base, hasCsc: true });
    expect(resolveHelpAlias(HELP_ALIAS_CSC, none)).toBe(NEW_CSC_THREAD_ID);
  });

  it('waits for the conversations to load, so it never picks "start one" while the real conversation is still on its way', () => {
    const beforeLoad = buildClientThreads({ ...base, hasCsc: true });
    expect(resolveHelpAlias(HELP_ALIAS_CSC, beforeLoad, false)).toBeNull();
    expect(resolveHelpAlias(HELP_ALIAS_SUPPORT, beforeLoad, false)).toBeNull();
    const afterLoad = buildClientThreads({ ...base, conversations: [conv({ id: 'real', topic: 'csc', type: 'direct' })], hasCsc: true });
    expect(resolveHelpAlias(HELP_ALIAS_CSC, afterLoad, true)).toBe('real');
  });

  it('does not send "Support" to a place that does not exist for academy-only people', () => {
    expect(resolveHelpAlias(HELP_ALIAS_SUPPORT, buildClientThreads({ ...base, academyOnly: true }))).toBeNull();
  });

  it('stays unresolved when there is no consultant, and ignores ids that are not aliases', () => {
    expect(resolveHelpAlias(HELP_ALIAS_CSC, buildClientThreads(base))).toBeNull();
    expect(resolveHelpAlias(ASK_VIV_THREAD_ID, buildClientThreads(base))).toBeNull();
    expect(resolveHelpAlias(null, buildClientThreads(base))).toBeNull();
  });
});
