import { describe, expect, it } from 'vitest';
import { buildTimeline, filterThreads, kindsPresent, readDraft, seenSummary, sortThreads, totalUnread, typingLabel, writeDraft } from '../messengerLogic';
import type { MessengerMessage, MessengerPerson, MessengerThread } from '../types';

const msg = (id: string, at: string, over: Partial<MessengerMessage> = {}): MessengerMessage => ({
  id, senderId: 'a', senderName: 'Alex Staff', senderRole: 'staff', fromMe: false, body: id, createdAt: at, ...over,
});
const thread = (id: string, over: Partial<MessengerThread> = {}): MessengerThread => ({ id, kind: 'general', title: id, unread: false, ...over });
const NOW = new Date('2026-11-20T03:00:00Z');

describe('threads', () => {
  it('sorts pinned first, then newest activity, without changing the input', () => {
    const input = [thread('old', { lastActivityAt: '2026-11-01T00:00:00Z' }), thread('new', { lastActivityAt: '2026-11-10T00:00:00Z' }), thread('pin', { pinned: true, lastActivityAt: '2026-10-01T00:00:00Z' })];
    expect(sortThreads(input).map((t) => t.id)).toEqual(['pin', 'new', 'old']);
    expect(input.map((t) => t.id)).toEqual(['old', 'new', 'pin']);
  });

  it('keeps pinned threads in the order they were given, whatever their activity', () => {
    const input = [thread('viv', { pinned: true }), thread('csc', { pinned: true, lastActivityAt: '2026-11-18T00:00:00Z' }), thread('other', { lastActivityAt: '2026-11-19T00:00:00Z' })];
    expect(sortThreads(input).map((t) => t.id)).toEqual(['viv', 'csc', 'other']);
  });

  it('filters by unread, by kind and by search over title, kind label and preview', () => {
    const list = [
      thread('Ask Viv', { kind: 'ask_viv', preview: 'compliance question' }),
      thread('Ticket 12', { kind: 'support', unread: true, preview: 'we are looking' }),
      thread('Package update', { kind: 'package' }),
    ];
    expect(filterThreads(list, 'unread', '').map((t) => t.id)).toEqual(['Ticket 12']);
    expect(filterThreads(list, 'support', '').map((t) => t.id)).toEqual(['Ticket 12']);
    expect(filterThreads(list, 'all', 'COMPLIANCE').map((t) => t.id)).toEqual(['Ask Viv']);
    expect(filterThreads(list, 'all', 'support').map((t) => t.id)).toEqual(['Ticket 12']);
  });

  it('counts unread, treating an unknown count as one, and lists kinds in a stable order', () => {
    expect(totalUnread([thread('a', { unread: true }), thread('b', { unread: true, unreadCount: 4 }), thread('c')])).toBe(5);
    expect(kindsPresent([thread('a', { kind: 'support' }), thread('b', { kind: 'ask_viv' }), thread('c', { kind: 'support' })])).toEqual(['ask_viv', 'support']);
  });
});

describe('buildTimeline', () => {
  it('groups one sender within the gap, splits on a pause, a new sender and a new day', () => {
    const items = buildTimeline(
      [
        msg('m1', '2026-11-19T01:00:00Z'),
        msg('m2', '2026-11-19T01:02:00Z'),
        msg('m3', '2026-11-19T01:30:00Z'),
        msg('m4', '2026-11-19T01:31:00Z', { senderId: 'b', senderName: 'Sam' }),
        msg('m5', '2026-11-20T01:00:00Z', { senderId: 'b', senderName: 'Sam' }),
      ],
      { now: NOW },
    );
    const shape = items.map((i) => (i.type === 'group' ? i.messages.map((m) => m.id).join('+') : i.type));
    expect(shape).toEqual(['day', 'm1+m2', 'm3', 'm4', 'day', 'm5']);
  });

  it('sorts unordered input and labels the days', () => {
    const items = buildTimeline([msg('b', '2026-11-20T02:00:00Z'), msg('a', '2026-11-19T02:00:00Z')], { now: NOW });
    expect(items.filter((i) => i.type === 'day').map((i) => (i as { label: string }).label)).toEqual(['Yesterday', 'Today']);
  });

  it('puts "New messages" before the first message from someone else after the read position, never for your own', () => {
    const items = buildTimeline(
      [msg('m1', '2026-11-19T01:00:00Z'), msg('mine', '2026-11-19T01:10:00Z', { fromMe: true, senderId: 'me' }), msg('m2', '2026-11-19T01:20:00Z'), msg('m3', '2026-11-19T01:21:00Z')],
      { now: NOW, unreadAfter: '2026-11-19T01:05:00Z' },
    );
    const shape = items.map((i) => (i.type === 'group' ? i.messages.map((m) => m.id).join('+') : i.type));
    expect(shape).toEqual(['day', 'm1', 'mine', 'unread', 'm2+m3']);
  });

  it('shows no divider when nothing arrived after the read position', () => {
    const items = buildTimeline([msg('m1', '2026-11-19T01:00:00Z')], { now: NOW, unreadAfter: '2026-11-19T02:00:00Z' });
    expect(items.some((i) => i.type === 'unread')).toBe(false);
  });
});

describe('seen and typing', () => {
  const mine = msg('mine', '2026-11-19T01:00:00Z', { fromMe: true, senderId: 'me' });
  const person = (id: string, name: string, lastReadAt: string | null): MessengerPerson => ({ id, name, lastReadAt });

  it('says Seen for a one to one thread, names a single reader and counts several', () => {
    expect(seenSummary([mine], [person('p', 'Sam Lee', '2026-11-19T02:00:00Z')])).toEqual({ messageId: 'mine', label: 'Seen' });
    expect(seenSummary([mine], [person('p', 'Sam Lee', '2026-11-19T02:00:00Z'), person('q', 'Al', null)])).toEqual({ messageId: 'mine', label: 'Seen by Sam' });
    expect(seenSummary([mine], [person('p', 'Sam', '2026-11-19T02:00:00Z'), person('q', 'Al', '2026-11-19T03:00:00Z')])?.label).toBe('Seen by 2');
  });

  it("never counts the sender's own read position, even when they are in the participant list", () => {
    const me = person('me', 'Me Myself', '2026-11-19T05:00:00Z');
    expect(seenSummary([mine], [me, person('p', 'Sam', null)])).toBeNull();
    expect(seenSummary([mine], [me])).toBeNull();
    expect(seenSummary([mine], [me, person('p', 'Sam Lee', '2026-11-19T02:00:00Z')])).toEqual({ messageId: 'mine', label: 'Seen' });
  });

  it('shows nothing when no one has read it, read state is unknown, or the message did not send', () => {
    expect(seenSummary([mine], [person('p', 'Sam', '2026-11-18T00:00:00Z')])).toBeNull();
    expect(seenSummary([mine], undefined)).toBeNull();
    expect(seenSummary([{ ...mine, delivery: 'failed' }], [person('p', 'Sam', '2026-11-19T02:00:00Z')])).toBeNull();
  });

  it('words the typing line for one, two and several people', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['Sam Lee'])).toBe('Sam is typing…');
    expect(typingLabel(['Sam Lee', 'Al Roe'])).toBe('Sam and Al are typing…');
    expect(typingLabel(['a', 'b', 'c'])).toBe('Several people are typing…');
  });
});

describe('drafts', () => {
  it('round trips and clears, and survives blocked storage', () => {
    writeDraft('k1', 'hello');
    expect(readDraft('k1')).toBe('hello');
    writeDraft('k1', '');
    expect(readDraft('k1')).toBe('');
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    expect(readDraft('k1')).toBe('');
    expect(() => writeDraft('k1', 'x')).not.toThrow();
    Object.defineProperty(window, 'localStorage', orig);
  });
});
