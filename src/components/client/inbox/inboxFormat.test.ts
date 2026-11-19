import { describe, expect, it } from 'vitest';
import { ago, dayDivider, dayGroup, groupByDay, initialsOf, matchesSearch, notificationKind, threadKind } from './inboxFormat';

// Thursday 19 November 2026, midday.
const now = new Date(2026, 10, 19, 12, 0, 0);

describe('inbox formatting', () => {
  it('puts items under Today, Yesterday, This week and Earlier', () => {
    expect(dayGroup(new Date(2026, 10, 19, 8), now)).toBe('Today');
    expect(dayGroup(new Date(2026, 10, 18, 23), now)).toBe('Yesterday');
    expect(dayGroup(new Date(2026, 10, 16, 9), now)).toBe('This week'); // Monday
    expect(dayGroup(new Date(2026, 10, 15, 9), now)).toBe('Earlier'); // Sunday, last week
  });

  it('groups in order, drops empty groups and keeps order inside a group', () => {
    const items = [
      { id: 'old', at: new Date(2026, 9, 1).toISOString() },
      { id: 'a', at: new Date(2026, 10, 19, 9).toISOString() },
      { id: 'b', at: new Date(2026, 10, 19, 8).toISOString() },
    ];
    const groups = groupByDay(items, (i) => i.at, now);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Earlier']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('labels the divider between days in a conversation', () => {
    expect(dayDivider(new Date(2026, 10, 19, 9), now)).toBe('Today');
    expect(dayDivider(new Date(2026, 10, 18, 9), now)).toBe('Yesterday');
    expect(dayDivider(new Date(2026, 10, 3, 9), now)).toBe('Tuesday 3 November');
    expect(dayDivider(new Date(2025, 11, 3, 9), now)).toBe('3 December 2025');
  });

  it('says just now for the last minute and gives a short age after that', () => {
    expect(ago(new Date().toISOString())).toBe('just now');
    expect(ago(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 hours ago');
    expect(ago(null)).toBe('');
    expect(ago('not a date')).toBe('');
  });

  it('makes initials and tolerates empty names', () => {
    expect(initialsOf('Nova Canto')).toBe('NC');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });

  it('searches subject, topic and preview in any case, and matches everything for an empty search', () => {
    const t = { subject: 'Annual Declaration', topic: 'general', last_message_preview: 'Your CEO receives a link' };
    expect(matchesSearch(t, 'declaration')).toBe(true);
    expect(matchesSearch(t, 'CEO')).toBe(true);
    expect(matchesSearch(t, 'invoice')).toBe(false);
    expect(matchesSearch(t, '   ')).toBe(true);
  });

  it('maps conversation and notification types, with a safe default', () => {
    expect(threadKind('broadcast')).toBe('broadcast');
    expect(threadKind('mystery')).toBe('general');
    expect(threadKind(null)).toBe('general');
    expect(notificationKind('task_due')).toBe('tasks');
    expect(notificationKind('Meeting_Upcoming')).toBe('meetings');
    expect(notificationKind('obligation_due')).toBe('obligations');
    expect(notificationKind('event')).toBe('events');
    expect(notificationKind('anything')).toBe('other');
  });
});

describe('inbox stats', () => {
  const threads = [
    { isUnread: true, type: 'broadcast', subject: 'ADC opens', created_at: '2026-11-01T00:00:00Z', last_message_at: '2026-11-18T00:00:00Z' },
    { isUnread: false, type: 'package', subject: null, topic: 'stage two', created_at: '2026-10-01T00:00:00Z', last_message_at: '2026-10-20T00:00:00Z' },
  ];
  const notes = [
    { is_read: false, type: 'task_due', title: 'Send the matrix', created_at: '2026-11-19T00:00:00Z' },
    { is_read: false, type: 'obligation_due', title: 'ADC soon', created_at: '2026-11-10T00:00:00Z' },
    { is_read: true, type: 'message', title: 'New message', created_at: '2026-11-18T00:00:00Z' },
  ];

  it('counts what is unread and picks the latest item on each card', async () => {
    const { inboxStats } = await import('./inboxFormat');
    const s = inboxStats(threads, notes);
    expect(s.messages).toMatchObject({ total: 2, unread: 1, fromVivacityUnread: 1, latestSubject: 'ADC opens' });
    expect(s.notifications).toMatchObject({ total: 3, unread: 2, tasksUnread: 1, obligationsUnread: 1, latestTitle: 'Send the matrix' });
    // Everything leaves out the message-type notification, whose conversation is already listed.
    expect(s.all).toMatchObject({ total: 4, unread: 3 });
    expect(s.all.latestAt).toBe('2026-11-19T00:00:00Z');
  });

  it('is empty and safe with nothing in the inbox', async () => {
    const { inboxStats } = await import('./inboxFormat');
    const s = inboxStats([], []);
    expect(s.all).toEqual({ total: 0, unread: 0, latestAt: null });
    expect(s.messages.latestSubject).toBeNull();
    expect(s.notifications.latestTitle).toBeNull();
  });
});
