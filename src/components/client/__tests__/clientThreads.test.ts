import { describe, expect, it } from 'vitest';
import { ASK_VIV_THREAD_ID, NEW_CSC_THREAD_ID, buildClientThreads } from '../clientThreads';
import type { ConversationThread } from '@/hooks/useClientCommunications';

const conv = (over: Partial<ConversationThread>): ConversationThread =>
  ({ id: 'c', tenant_id: 1, subject: 'S', topic: 'general', type: 'general', last_message_at: '2026-11-19T01:00:00Z', last_message_preview: 'p', created_at: '2026-11-18T00:00:00Z', status: 'open', isUnread: false, myLastReadAt: null, ...over }) as ConversationThread;

describe('the client messenger thread list', () => {
  it('always starts with Ask Viv, pinned, and never unread', () => {
    const [first] = buildClientThreads({ conversations: [], cscName: null, cscAvatarUrl: null, hasCsc: false });
    expect(first).toMatchObject({ id: ASK_VIV_THREAD_ID, kind: 'ask_viv', pinned: true, unread: false });
  });

  it('offers a place to start a conversation with the consultant when one is assigned and none exists yet', () => {
    const threads = buildClientThreads({ conversations: [conv({ id: 'a' })], cscName: 'Nova Canto', cscAvatarUrl: null, hasCsc: true });
    expect(threads.find((t) => t.id === NEW_CSC_THREAD_ID)).toMatchObject({ kind: 'csc', title: 'Nova Canto', pinned: true });
  });

  it('offers nothing for a consultant when none is assigned', () => {
    const threads = buildClientThreads({ conversations: [], cscName: null, cscAvatarUrl: null, hasCsc: false });
    expect(threads.map((t) => t.id)).toEqual([ASK_VIV_THREAD_ID]);
  });

  it('uses the most recent conversation with the consultant as the consultant thread, however it was created', () => {
    const threads = buildClientThreads({
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
});
