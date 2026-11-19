import { describe, expect, it } from 'vitest';
import { hoursForecast } from './packageInsights';

const today = new Date('2026-11-19T00:00:00');
const pts = (rows: Array<[string, number]>) => rows.map(([activity_date, hours_on_day]) => ({ activity_date, hours_on_day }));

describe('hoursForecast', () => {
  it('handles a package with no hours or with everything used', () => {
    expect(hoursForecast([], 0, 0, null, today).verdict).toBe('no_hours');
    expect(hoursForecast([], 10, 10, null, today).verdict).toBe('used_up');
  });

  it('says there is no pace when nothing was recorded in the last four weeks', () => {
    const f = hoursForecast(pts([['2026-08-01', 5]]), 40, 5, '2027-03-01', today);
    expect(f.verdict).toBe('no_recent_work');
    expect(f.runOutDate).toBeNull();
  });

  it('warns when the hours would run out well before the end date', () => {
    // 14 hours in the last four weeks = 3.5 a week; 10 left runs out in about 20 days, end is months away.
    const f = hoursForecast(pts([['2026-11-10', 7], ['2026-11-15', 7]]), 40, 30, '2027-03-01', today);
    expect(f.verdict).toBe('early');
    expect(f.perWeek).toBeCloseTo(3.5, 5);
    expect(f.sentence).toContain('before 1 Mar 2027');
    expect(f.sentence).toContain('Worth a chat');
  });

  it('points out spare hours when the pace is slow', () => {
    // 2 hours in four weeks, 30 left, three months to go: about 30 - 2/28*100 hours left over.
    const f = hoursForecast(pts([['2026-11-10', 2]]), 40, 10, '2027-02-19', today);
    expect(f.verdict).toBe('spare');
    expect(f.unusedAtEnd).toBeGreaterThan(20);
    expect(f.sentence).toContain('unused');
  });

  it('calls it on pace when the run-out date is close to the end date', () => {
    // 1 hour a day for the last 28 days = 28 in the window; 28 left => runs out in 28 days = 17 Dec 2026.
    const f = hoursForecast(pts([['2026-11-01', 28]]), 56, 28, '2026-12-17', today);
    expect(f.verdict).toBe('on_pace');
    expect(f.sentence).toContain('on pace');
  });

  it('describes the pace without an end date', () => {
    const f = hoursForecast(pts([['2026-11-10', 14]]), 40, 20, null, today);
    expect(f.verdict).toBe('on_pace');
    expect(f.sentence).toContain('your hours would last until about');
  });
});
