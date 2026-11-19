import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { dayDivider, dayGroup } from './inboxFormat';
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2031, 2, 4, 10, 0, 0)); });
afterAll(() => vi.useRealTimers());
it('uses the supplied now, not the machine clock', () => {
  const now = new Date(2026, 10, 19, 12, 0, 0);
  expect(dayGroup(new Date(2026, 10, 19, 8), now)).toBe('Today');
  expect(dayGroup(new Date(2026, 10, 18, 23), now)).toBe('Yesterday');
  expect(dayDivider(new Date(2026, 10, 3, 9), now)).toBe('Tuesday 3 November');
});
