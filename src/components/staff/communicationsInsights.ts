import type { MessengerThread } from '@/components/messenger';

/**
 * The four numbers at the top of Team Communications, worked out from the threads already on the page, so they always agree
 * with the list and with the bell (unread comes from the notifications the routing sent).
 */

export type InsightView = 'all' | 'needs' | 'covering' | 'today';

export interface CommunicationsInsights {
  /** Conversations that have something unread for me. */
  needsYou: { count: number; oldestAt: string | null };
  /** Conversations I cover for a colleague, and how many of those are unread. */
  covering: { count: number; unread: number };
  /** Conversations with activity today. */
  today: { count: number };
}

const isCovering = (t: MessengerThread) => !!t.badge && t.badge.label.startsWith('Covering');

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const activeToday = (t: MessengerThread, now: Date) => !!t.lastActivityAt && sameDay(new Date(t.lastActivityAt), now);

export function communicationsInsights(threads: readonly MessengerThread[], now: Date = new Date()): CommunicationsInsights {
  const unread = threads.filter((t) => t.unread);
  // How long someone has waited is measured from the oldest unread message, not the latest one: a new follow-up on an
  // overdue conversation must not make it look newly waiting. (Falls back to the latest activity when that is not known.)
  const oldest = unread
    .map((t) => t.unreadSince ?? t.lastActivityAt)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  const covering = threads.filter(isCovering);
  return {
    needsYou: { count: unread.length, oldestAt: oldest ?? null },
    covering: { count: covering.length, unread: covering.filter((t) => t.unread).length },
    today: { count: threads.filter((t) => activeToday(t, now)).length },
  };
}

/** The threads a card stands for. "all" is every thread. */
export function applyInsightView(threads: readonly MessengerThread[], view: InsightView, now: Date = new Date()): MessengerThread[] {
  switch (view) {
    case 'needs':
      return threads.filter((t) => t.unread);
    case 'covering':
      return threads.filter(isCovering);
    case 'today':
      return threads.filter((t) => activeToday(t, now));
    default:
      return [...threads];
  }
}

/** "3 days", "5 hours", "20 minutes" for how long the oldest unread conversation has waited, or null when there is none. */
export function waitingFor(oldestAt: string | null, now: Date = new Date()): string | null {
  if (!oldestAt) return null;
  const ms = now.getTime() - new Date(oldestAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}
