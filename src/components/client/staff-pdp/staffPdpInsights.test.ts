import { describe, expect, it } from 'vitest';
import type { WorkforcePdpRow } from '@/features/pdp/workforce';
import { compareRows, daysLeft, elapsedPercent, hoursGap, hoursPerWeek, isBehindPace, paceGap, parseStatusParam, pctClamped, summariseStaffPdps } from './staffPdpInsights';

const today = new Date('2026-11-19T00:00:00Z');
let n = 0;
const row = (over: Partial<WorkforcePdpRow> = {}): WorkforcePdpRow => ({
  user_id: `u${++n}`, tenant_id: 1, audience_code: 'Trainer', cycle_year: 2026, cycle_end_date: '2027-03-31', status: 'active', percent_complete: 50,
  actual_pd_hours: 20, target_pd_hours: 40, days_until_cycle_end: 132, currency_status: 'on_track', staff_name: `Staff ${n}`, staff_email: null, tenant_name: 'Org', ...over,
});

describe('staff PDP insights', () => {
  it('keeps only known statuses from the URL', () => {
    expect(parseStatusParam('overdue,bogus,at_risk')).toEqual(['overdue', 'at_risk']);
    expect(parseStatusParam('nonsense')).toEqual([]);
    expect(parseStatusParam(null)).toEqual([]);
  });

  it('clamps progress and never reports a gap without a target', () => {
    expect(pctClamped(row({ percent_complete: 140 }))).toBe(100);
    expect(pctClamped(row({ percent_complete: -3 }))).toBe(0);
    expect(pctClamped(row({ percent_complete: Number.NaN }))).toBe(0);
    expect(hoursGap(row({ target_pd_hours: 40, actual_pd_hours: 55 }))).toBe(0);
    expect(hoursGap(row({ target_pd_hours: 40, actual_pd_hours: 12.5 }))).toBe(27.5);
    expect(hoursGap(row({ target_pd_hours: 0, actual_pd_hours: 0 }))).toBe(0);
  });

  it('works out days left and time elapsed, falling back to the end date', () => {
    expect(daysLeft(row({ days_until_cycle_end: -4 }), today)).toBe(-4);
    expect(daysLeft(row({ days_until_cycle_end: null, cycle_end_date: '2026-11-29' }), today)).toBe(10);
    expect(daysLeft(row({ days_until_cycle_end: null, cycle_end_date: null }), today)).toBeNull();
    expect(elapsedPercent(row({ days_until_cycle_end: 365 }), today)).toBe(0);
    expect(elapsedPercent(row({ days_until_cycle_end: 73 }), today)).toBe(80);
    expect(elapsedPercent(row({ days_until_cycle_end: -30 }), today)).toBe(100);
  });

  it('flags behind pace only when it is meaningful', () => {
    // 80% through the cycle, 30% done: 50 points behind.
    const behind = row({ days_until_cycle_end: 73, percent_complete: 30 });
    expect(paceGap(behind, today)).toBe(-50);
    expect(isBehindPace(behind, today)).toBe(true);
    // Too early in the cycle, no target, and finished staff are never flagged.
    expect(paceGap(row({ days_until_cycle_end: 350, percent_complete: 0 }), today)).toBeNull();
    expect(paceGap(row({ target_pd_hours: 0, days_until_cycle_end: 73 }), today)).toBeNull();
    expect(isBehindPace(row({ days_until_cycle_end: 73, percent_complete: 30, currency_status: 'current' }), today)).toBe(false);
    // A few points behind is fine.
    expect(isBehindPace(row({ days_until_cycle_end: 73, percent_complete: 70 }), today)).toBe(false);
  });

  it('gives hours a week needed, but not when the cycle is nearly over or done', () => {
    expect(hoursPerWeek(row({ target_pd_hours: 40, actual_pd_hours: 12, days_until_cycle_end: 70 }), today)).toBe(2.8);
    expect(hoursPerWeek(row({ days_until_cycle_end: 3 }), today)).toBeNull();
    expect(hoursPerWeek(row({ actual_pd_hours: 40 }), today)).toBeNull();
  });

  it('orders by status then end date, with no end date last', () => {
    const a = row({ currency_status: 'overdue', cycle_end_date: '2026-10-01' });
    const b = row({ currency_status: 'overdue', cycle_end_date: null });
    const c = row({ currency_status: 'at_risk', cycle_end_date: '2026-11-25' });
    expect([c, b, a].sort(compareRows)).toEqual([a, b, c]);
  });

  it('summarises counts, team gap, audiences, the chase list and cycle ends', () => {
    const rows = [
      row({ currency_status: 'overdue', days_until_cycle_end: -14, cycle_end_date: '2026-11-05', actual_pd_hours: 10, percent_complete: 25, staff_name: 'Ana' }),
      row({ currency_status: 'at_risk', days_until_cycle_end: 9, cycle_end_date: '2026-11-28', actual_pd_hours: 20, percent_complete: 50, staff_name: 'Ben' }),
      row({ currency_status: 'current', percent_complete: 100, actual_pd_hours: 40, cycle_end_date: '2027-01-10', days_until_cycle_end: 52, audience_code: 'Assessor' }),
      row({ currency_status: 'on_track', days_until_cycle_end: 73, percent_complete: 30, actual_pd_hours: 12, cycle_end_date: '2027-01-31', staff_name: 'Cy' }),
      row({ target_pd_hours: 0, actual_pd_hours: 0, percent_complete: 0, audience_code: null }),
    ];
    const s = summariseStaffPdps(rows, today);
    expect(s.counts).toEqual({ overdue: 1, at_risk: 1, on_track: 2, current: 1 });
    expect(s).toMatchObject({ total: 5, needsAttention: 2, withTarget: 4, noTarget: 1, behindPace: 1, oldestOverdueDays: 14 });
    // Gaps: Ana 30, Ben 20, Cy 28, current 0.
    expect(s.teamGapHours).toBe(78);
    expect(s.teamProgress).toBe(Math.round((82 / 160) * 100));
    expect(s.nextCycleEnd).toEqual({ name: 'Ben', inDays: 9 });
    expect(s.chase.map((c) => c.row.staff_name)).toEqual(['Ana', 'Ben', 'Cy']);
    expect(s.chase[0].reason).toBe('Cycle ended 14 days ago, 30 h short');
    expect(s.chase[1].reason).toBe('9 days left, 20 h short');
    expect(s.chase[2].reason).toMatch(/^Behind pace by 50 points/);
    expect(s.byAudience[0]).toMatchObject({ name: 'Trainer', staff: 3, gap: 78 });
    expect(s.byAudience.find((a) => a.name === 'Assessor')).toMatchObject({ staff: 1, gap: 0 });
    expect(s.cycleEnds.ended).toBe(0);
    expect(s.cycleEnds.months.map((m) => [m.label, m.count, m.risky])).toEqual([['Nov', 2, 2], ['Dec', 0, 0], ['Jan', 2, 0], ['Feb', 0, 0], ['Mar', 1, 0], ['Apr', 0, 0]]);
  });

  it('hides team progress for fewer than three staff and is safe with no rows', () => {
    expect(summariseStaffPdps([row(), row()], today).teamProgress).toBeNull();
    expect(summariseStaffPdps([], today)).toMatchObject({ total: 0, needsAttention: 0, teamGapHours: 0, teamProgress: null, nextCycleEnd: null, chase: [], byAudience: [] });
  });
});
