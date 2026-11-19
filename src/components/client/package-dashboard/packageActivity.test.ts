import { describe, expect, it } from 'vitest';
import { activityFacts, heatmap, mixByMonth, weekBins, weekOf, weeklySnapshot, workTypeStyle, type PackageActivity } from './packageActivity';

const today = new Date('2026-11-19T00:00:00');

const activity: PackageActivity = {
  window: { start: '2026-04-23', end: '2027-04-23' },
  daily: [
    { day: '2026-10-05', work_type: 'document_review', minutes: 60, entries: 1 },
    { day: '2026-11-10', work_type: 'meeting', minutes: 120, entries: 1 },
    { day: '2026-11-17', work_type: 'general', minutes: 90, entries: 2 },
    { day: '2026-11-18', work_type: 'meeting', minutes: 30, entries: 1 },
  ],
  touchpoints: [{ week_start: '2026-11-16', kind: 'email', count: 2 }, { week_start: '2026-11-16', kind: 'call', count: 1 }],
  tasks: [{ week_start: '2026-11-16', created: 3, completed: 2 }],
  documents: [{ week_start: '2026-11-16', count: 1 }],
};
const empty: PackageActivity = { window: null, daily: [], touchpoints: [], tasks: [], documents: [] };

describe('package activity helpers', () => {
  it('gives each kind of work one look, with a shape as well as a colour', () => {
    expect(workTypeStyle('document_review')).toMatchObject({ label: 'Document Review', shape: 'diamond' });
    expect(workTypeStyle('Meeting').key).toBe('meeting');
    expect(workTypeStyle('something_new')).toMatchObject({ label: 'Something New', shape: 'triangle' });
  });

  it('puts a date in its Monday-to-Sunday week', () => {
    expect(weekOf('2026-11-19')).toBe('2026-11-16');
    expect(weekOf('2026-11-22')).toBe('2026-11-16');
    expect(weekOf('2026-11-23')).toBe('2026-11-23');
  });

  it('bins hours by week with a running total and each week’s main work', () => {
    const bins = weekBins(activity.daily);
    expect(bins.map((b) => [b.week, b.minutes, b.cumulativeHours, b.dominant])).toEqual([
      ['2026-10-05', 60, 1, 'document_review'],
      ['2026-11-09', 120, 3, 'meeting'],
      ['2026-11-16', 120, 5, 'general'],
    ]);
  });

  it('builds a heatmap of every week from the first to this week, with quiet weeks as zeros', () => {
    const h = heatmap(activity.daily, today);
    expect(h.types).toEqual(['meeting', 'general', 'document_review']);
    expect(h.weeks).toHaveLength(7);
    expect(h.minutes[0][5]).toBe(120);
    expect(h.minutes[0][6]).toBe(30);
    expect(h.minutes[1][6]).toBe(90);
    expect(h.minutes[0][1]).toBe(0);
    expect(h.maxMinutes).toBe(120);
    expect(heatmap([], today)).toMatchObject({ weeks: [], maxMinutes: 0 });
  });

  it('folds the smallest work types into Other once there are more than five', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((t, i) => ({ day: '2026-11-17', work_type: t, minutes: 100 - i * 10, entries: 1 }));
    const h = heatmap(many, today);
    expect(h.types).toEqual(['a', 'b', 'c', 'd', 'e', 'Other']);
    expect(h.minutes[5][0]).toBe(50 + 40);
  });

  it('shows each month as shares that add up', () => {
    const mix = mixByMonth(activity.daily);
    expect(mix.map((m) => m.month)).toEqual(['2026-10', '2026-11']);
    expect(mix[0].shares).toEqual([{ type: 'document_review', minutes: 60, percent: 100 }]);
    expect(mix[1].shares.map((s) => [s.type, s.percent])).toEqual([['meeting', 63], ['general', 38]]);
  });

  it('writes the weekly snapshot as plain sentences from this week and last', () => {
    const s = weeklySnapshot(activity, today);
    expect(s).toMatchObject({ hoursThisWeek: 2, hoursLastWeek: 2, entriesThisWeek: 3, topTypeThisWeek: 'general', touchpointsThisWeek: 3, tasksClosedThisWeek: 2, documentsThisWeek: 1, daysSinceLastEntry: 1 });
    expect(s.lines).toEqual([
      '2 hours logged this week across 3 entries, the same as last week.',
      'Most of it was general.',
      'Also this week: 3 touchpoints with your Vivacity team, 2 tasks closed, 1 document generated.',
    ]);
  });

  it('says so when nothing is logged, whether never or for two weeks', () => {
    expect(weeklySnapshot(empty, today).lines).toEqual(['No hours have been recorded on this package yet.']);
    const quiet = weeklySnapshot({ ...activity, daily: [{ day: '2026-10-05', work_type: 'general', minutes: 60, entries: 1 }], touchpoints: [], tasks: [], documents: [] }, today);
    expect(quiet.lines[0]).toBe('Nothing has been logged for two weeks. The last entry was 45 days ago.');
  });

  it('describes the rhythm of the whole package', () => {
    const f = activityFacts(activity);
    expect(f).toMatchObject({ activeWeeks: 3, totalWeeks: 7, longestQuietDays: 35, busiestMonth: { label: 'November 2026', hours: 4 } });
    expect(f.sentence).toBe('Work happened in 3 of 7 weeks. The busiest month was November 2026 with 4 hours, and the longest quiet stretch was 35 days.');
    expect(activityFacts(empty).busiestMonth).toBeNull();
  });
});
