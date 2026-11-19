import { format, formatDistanceToNowStrict, isSameDay, isSameWeek, subDays } from 'date-fns';

export type DayGroup = 'Today' | 'Yesterday' | 'This week' | 'Earlier';
const ORDER: DayGroup[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

/** Which heading an item sits under in a feed. Weeks start on Monday. */
export function dayGroup(date: Date, now: Date = new Date()): DayGroup {
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday';
  if (isSameWeek(date, now, { weekStartsOn: 1 })) return 'This week';
  return 'Earlier';
}

/** Items split under day headings, newest group first, empty groups left out. Input order is kept inside a group. */
export function groupByDay<T>(items: readonly T[], getDate: (item: T) => string | Date, now: Date = new Date()): Array<{ label: DayGroup; items: T[] }> {
  const buckets = new Map<DayGroup, T[]>();
  for (const item of items) {
    const label = dayGroup(new Date(getDate(item)), now);
    buckets.set(label, [...(buckets.get(label) ?? []), item]);
  }
  return ORDER.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label)! }));
}

/** The divider shown between days inside a conversation. */
export function dayDivider(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday';
  return format(date, date.getFullYear() === now.getFullYear() ? 'EEEE d MMMM' : 'd MMMM yyyy');
}

/** "3 hours ago" without the filler word, short enough for a list row. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (Date.now() - d.getTime() < 60_000) return 'just now';
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export interface SearchableThread {
  subject?: string | null;
  topic?: string | null;
  last_message_preview?: string | null;
}

/** Whether a conversation matches what was typed in the search box (subject, topic or preview, any case). */
export function matchesSearch(thread: SearchableThread, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [thread.subject, thread.topic, thread.last_message_preview].some((v) => (v ?? '').toLowerCase().includes(q));
}

export type ThreadKind = 'general' | 'package' | 'task' | 'rock' | 'broadcast' | 'csc' | 'direct';

export const THREAD_LABEL: Record<ThreadKind, string> = {
  general: 'General',
  package: 'Package',
  task: 'Task',
  rock: 'Rock',
  broadcast: 'From Vivacity',
  csc: 'Your CSC',
  direct: 'Direct',
};

export function threadKind(type: string | null | undefined): ThreadKind {
  return type && type in THREAD_LABEL ? (type as ThreadKind) : 'general';
}

export type NotificationKind = 'tasks' | 'meetings' | 'obligations' | 'events' | 'other';

export function notificationKind(type: string | null | undefined): NotificationKind {
  const t = (type ?? '').toLowerCase();
  if (t === 'task_due' || t === 'tasks') return 'tasks';
  if (t === 'meeting_upcoming' || t === 'meetings') return 'meetings';
  if (t === 'obligation_due' || t === 'obligations') return 'obligations';
  if (t === 'event' || t === 'events') return 'events';
  return 'other';
}

export const NOTIFICATION_LABEL: Record<NotificationKind, string> = {
  tasks: 'Task',
  meetings: 'Meeting',
  obligations: 'Obligation',
  events: 'Event',
  other: 'Update',
};

export interface InboxStats {
  all: { total: number; unread: number; latestAt: string | null };
  messages: { total: number; unread: number; fromVivacityUnread: number; latestSubject: string | null; latestAt: string | null };
  notifications: { total: number; unread: number; tasksUnread: number; obligationsUnread: number; latestTitle: string | null; latestAt: string | null };
}

interface StatsThread { isUnread: boolean; type: string | null; subject?: string | null; topic?: string | null; last_message_at?: string | null; created_at: string }
interface StatsNote { is_read: boolean; type: string; title: string; created_at: string }

const newest = <T>(items: readonly T[], at: (t: T) => string | null | undefined): T | null =>
  items.reduce<T | null>((best, t) => (!best || new Date(at(t) ?? 0) > new Date(at(best) ?? 0) ? t : best), null);

/** The figures on the three overview cards: counts, what is unread, and the latest thing in each. */
export function inboxStats(conversations: readonly StatsThread[], notifications: readonly StatsNote[]): InboxStats {
  const latestThread = newest(conversations, (c) => c.last_message_at ?? c.created_at);
  const latestNote = newest(notifications, (n) => n.created_at);
  // The "everything" feed leaves out message-type notifications because the conversation itself is listed.
  const feedNotes = notifications.filter((n) => n.type !== 'message');
  const unreadThreads = conversations.filter((c) => c.isUnread);
  const unreadNotes = notifications.filter((n) => !n.is_read);
  const unreadFeedNotes = feedNotes.filter((n) => !n.is_read);
  const latestAll = newest([...conversations.map((c) => c.last_message_at ?? c.created_at), ...feedNotes.map((n) => n.created_at)], (x) => x);
  return {
    all: { total: conversations.length + feedNotes.length, unread: unreadThreads.length + unreadFeedNotes.length, latestAt: latestAll },
    messages: {
      total: conversations.length,
      unread: unreadThreads.length,
      fromVivacityUnread: unreadThreads.filter((c) => c.type === 'broadcast').length,
      latestSubject: latestThread ? latestThread.subject || latestThread.topic || 'General' : null,
      latestAt: latestThread ? (latestThread.last_message_at ?? latestThread.created_at) : null,
    },
    notifications: {
      total: notifications.length,
      unread: unreadNotes.length,
      tasksUnread: unreadNotes.filter((n) => notificationKind(n.type) === 'tasks').length,
      obligationsUnread: unreadNotes.filter((n) => notificationKind(n.type) === 'obligations').length,
      latestTitle: latestNote?.title ?? null,
      latestAt: latestNote?.created_at ?? null,
    },
  };
}
