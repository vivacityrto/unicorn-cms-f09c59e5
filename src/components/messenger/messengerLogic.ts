import { dayDivider, matchesSearch } from '@/components/client/inbox/inboxFormat';
import type { MessengerMessage, MessengerPerson, MessengerThread, ThreadKind } from './types';

export type ThreadFilter = 'all' | 'unread' | ThreadKind;

export const THREAD_KIND_LABEL: Record<ThreadKind, string> = {
  ask_viv: 'Ask Viv',
  csc: 'Your CSC',
  support: 'Support',
  broadcast: 'From Vivacity',
  package: 'Package',
  task: 'Task',
  rock: 'Rock',
  general: 'General',
  direct: 'Direct',
};

const time = (iso: string | null | undefined): number => {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
};

/** Pinned threads first, then the most recent activity. Does not change the input. */
export function sortThreads(threads: readonly MessengerThread[]): MessengerThread[] {
  return [...threads].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || time(b.lastActivityAt) - time(a.lastActivityAt));
}

export function filterThreads(threads: readonly MessengerThread[], filter: ThreadFilter, query: string): MessengerThread[] {
  return threads.filter((t) => {
    if (filter === 'unread' && !t.unread) return false;
    if (filter !== 'all' && filter !== 'unread' && t.kind !== filter) return false;
    return matchesSearch({ subject: t.title, topic: THREAD_KIND_LABEL[t.kind], last_message_preview: t.preview }, query);
  });
}

/** The number on the bubble and the Inbox tab. A thread with an unknown count still counts as one. */
export function totalUnread(threads: readonly MessengerThread[]): number {
  return threads.reduce((n, t) => n + (t.unread ? Math.max(t.unreadCount ?? 1, 1) : 0), 0);
}

/** The kinds present, in a fixed order, so filter chips are stable and only show what exists. */
export function kindsPresent(threads: readonly MessengerThread[]): ThreadKind[] {
  const order = Object.keys(THREAD_KIND_LABEL) as ThreadKind[];
  return order.filter((k) => threads.some((t) => t.kind === k));
}

export type TimelineItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'unread'; key: string }
  | { type: 'group'; key: string; fromMe: boolean; senderName: string; senderAvatarUrl?: string | null; senderRole: MessengerMessage['senderRole']; messages: MessengerMessage[] };

interface TimelineOptions {
  now?: Date;
  /** Messages from others created after this show a "New messages" divider. Leave out when nothing is unread. */
  unreadAfter?: string | null;
  /** A pause longer than this starts a new group even for the same sender. */
  groupGapMinutes?: number;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Turns a flat message list into what is drawn: day dividers, "New messages", and runs of messages by one sender.
 * Input does not need to be sorted.
 */
export function buildTimeline(messages: readonly MessengerMessage[], opts: TimelineOptions = {}): TimelineItem[] {
  const now = opts.now ?? new Date();
  const gap = (opts.groupGapMinutes ?? 5) * 60_000;
  const sorted = [...messages].sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const unreadAt = opts.unreadAfter ? time(opts.unreadAfter) : null;
  const firstUnread = unreadAt === null ? undefined : sorted.find((m) => !m.fromMe && time(m.createdAt) > unreadAt);

  const items: TimelineItem[] = [];
  let prev: MessengerMessage | undefined;
  let current: Extract<TimelineItem, { type: 'group' }> | undefined;

  for (const m of sorted) {
    const at = new Date(m.createdAt);
    const newDay = !prev || !sameDay(new Date(prev.createdAt), at);
    if (newDay) {
      items.push({ type: 'day', key: `day-${at.toDateString()}`, label: dayDivider(at, now) });
      current = undefined;
    }
    if (firstUnread && m.id === firstUnread.id) {
      items.push({ type: 'unread', key: 'unread' });
      current = undefined;
    }
    const continues = current && prev && prev.senderId === m.senderId && prev.fromMe === m.fromMe && time(m.createdAt) - time(prev.createdAt) <= gap;
    if (continues && current) {
      current.messages.push(m);
    } else {
      current = { type: 'group', key: `group-${m.id}`, fromMe: m.fromMe, senderName: m.senderName, senderAvatarUrl: m.senderAvatarUrl, senderRole: m.senderRole, messages: [m] };
      items.push(current);
    }
    prev = m;
  }
  return items;
}

/** "Seen", "Seen by Sam" or "Seen by 3" for your most recent message, or null when no one has read it (or read state is unknown). */
export function seenSummary(messages: readonly MessengerMessage[], people: readonly MessengerPerson[] | undefined): { messageId: string; label: string } | null {
  if (!people?.length) return null;
  const mine = [...messages].filter((m) => m.fromMe && m.delivery !== 'sending' && m.delivery !== 'failed').sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  if (!mine) return null;
  // The sender's own read position never counts as someone having seen their message.
  const others = people.filter((p) => p.id !== mine.senderId);
  if (others.length === 0) return null;
  const readers = others.filter((p) => p.lastReadAt && time(p.lastReadAt) >= time(mine.createdAt));
  if (readers.length === 0) return null;
  if (readers.length === 1 && others.length === 1) return { messageId: mine.id, label: 'Seen' };
  return { messageId: mine.id, label: readers.length === 1 ? `Seen by ${readers[0].name.split(/\s+/)[0]}` : `Seen by ${readers.length}` };
}

/** "Sam is typing…", "Sam and Alex are typing…" or "Several people are typing…". Empty string when no one is. */
export function typingLabel(names: readonly string[]): string {
  const first = names.map((n) => n.split(/\s+/)[0]).filter(Boolean);
  if (first.length === 0) return '';
  if (first.length === 1) return `${first[0]} is typing…`;
  if (first.length === 2) return `${first[0]} and ${first[1]} are typing…`;
  return 'Several people are typing…';
}

/** Drafts survive switching threads and reloads. Storage can be blocked, so every access is guarded. */
export const draftKey = (scope: string, threadId: string) => `messenger:draft:${scope}:${threadId}`;

export function readDraft(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: the draft just won't survive a reload */
  }
}
