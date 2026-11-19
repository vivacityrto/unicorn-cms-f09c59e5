import { describe, expect, it } from 'vitest';
import { applyInsightView, communicationsInsights, waitingFor } from '../communicationsInsights';
import type { MessengerThread } from '@/components/messenger';

const NOW = new Date('2026-11-19T10:00:00');
const t = (id: string, over: Partial<MessengerThread> = {}): MessengerThread => ({ id, kind: 'general', title: id, unread: false, ...over });

const threads: MessengerThread[] = [
  t('a', { unread: true, lastActivityAt: '2026-11-16T09:00:00' }),
  t('b', { unread: true, lastActivityAt: '2026-11-19T08:00:00', badge: { label: 'Covering Nova', tone: 'info' } }),
  t('c', { lastActivityAt: '2026-11-19T07:00:00', badge: { label: 'Covering Nova', tone: 'info' } }),
  t('d', { lastActivityAt: '2026-11-10T07:00:00', badge: { label: 'Watching', tone: 'neutral' } }),
  t('e'),
];

describe('communications insights', () => {
  it('counts what needs me and how long the oldest has waited', () => {
    const i = communicationsInsights(threads, NOW);
    expect(i.needsYou).toEqual({ count: 2, oldestAt: '2026-11-16T09:00:00' });
  });

  it('counts the conversations I cover for a colleague, and how many of those are unread', () => {
    expect(communicationsInsights(threads, NOW).covering).toEqual({ count: 2, unread: 1 });
  });

  it('counts conversations with activity today only', () => {
    expect(communicationsInsights(threads, NOW).today.count).toBe(2);
  });

  it('copes with nothing at all', () => {
    expect(communicationsInsights([], NOW)).toEqual({ needsYou: { count: 0, oldestAt: null }, covering: { count: 0, unread: 0 }, today: { count: 0 } });
  });
});

describe('what each card shows', () => {
  it('filters to exactly the threads the card counts', () => {
    expect(applyInsightView(threads, 'needs', NOW).map((x) => x.id)).toEqual(['a', 'b']);
    expect(applyInsightView(threads, 'covering', NOW).map((x) => x.id)).toEqual(['b', 'c']);
    expect(applyInsightView(threads, 'today', NOW).map((x) => x.id)).toEqual(['b', 'c']);
    expect(applyInsightView(threads, 'all', NOW)).toHaveLength(5);
  });

  it('matches the numbers on the cards', () => {
    const i = communicationsInsights(threads, NOW);
    expect(applyInsightView(threads, 'needs', NOW)).toHaveLength(i.needsYou.count);
    expect(applyInsightView(threads, 'covering', NOW)).toHaveLength(i.covering.count);
    expect(applyInsightView(threads, 'today', NOW)).toHaveLength(i.today.count);
  });
});

describe('how long someone has waited', () => {
  it('says it in the unit that reads best', () => {
    expect(waitingFor('2026-11-19T09:59:30', NOW)).toBe('under a minute');
    expect(waitingFor('2026-11-19T09:59:00', NOW)).toBe('1 minute');
    expect(waitingFor('2026-11-19T09:20:00', NOW)).toBe('40 minutes');
    expect(waitingFor('2026-11-19T05:00:00', NOW)).toBe('5 hours');
    expect(waitingFor('2026-11-16T10:00:00', NOW)).toBe('3 days');
  });

  it('says nothing when there is nobody waiting or the time is in the future', () => {
    expect(waitingFor(null, NOW)).toBeNull();
    expect(waitingFor('2026-11-20T10:00:00', NOW)).toBeNull();
  });
});
