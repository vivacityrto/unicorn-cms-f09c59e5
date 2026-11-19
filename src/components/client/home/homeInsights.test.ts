import { describe, expect, it } from 'vitest';
import { hoursPercent, stagePercent, statusReason, summaryLines, totalsOf, type HomePackage } from './homeInsights';

const today = new Date('2026-11-19T00:00:00Z');
const pkg = (over: Partial<HomePackage> = {}): HomePackage => ({
  package_instance_id: 1,
  package_name: 'Ruby RTO Membership',
  is_complete: false,
  hours_total: 40,
  hours_used: 10,
  hours_remaining: 30,
  stages_total: 8,
  stages_complete: 2,
  current_stage_shortname: 'Setup',
  open_tasks: 3,
  overdue_tasks: 0,
  last_activity_at: '2026-11-15T00:00:00Z',
  end_date: '2027-03-01',
  status_pill: 'on_track',
  ...over,
});

describe('home insights', () => {
  it('works out stage and hours percentages without dividing by zero', () => {
    expect(stagePercent(pkg())).toBe(25);
    expect(hoursPercent(pkg())).toBe(25);
    expect(hoursPercent(pkg({ hours_total: 0, hours_used: 0 }))).toBe(0);
    expect(hoursPercent(pkg({ hours_total: 10, hours_used: 14 }))).toBe(100);
  });

  it('totals only active packages and finds the next end date still ahead', () => {
    const t = totalsOf(
      [
        pkg(),
        pkg({ package_instance_id: 2, hours_total: 20, hours_used: 20, end_date: '2026-12-01' }),
        pkg({ package_instance_id: 3, is_complete: true, hours_total: 999 }),
      ],
      today,
    );
    expect(t.packages).toBe(2);
    expect(t.hoursTotal).toBe(60);
    expect(t.hoursUsed).toBe(30);
    expect(t.hoursPercent).toBe(50);
    expect(t.nextEnd).toBe('2026-12-01');
  });

  it('explains a stuck package using the same rules as the status pill', () => {
    const quiet = pkg({ status_pill: 'stuck', last_activity_at: '2026-10-01T00:00:00Z', overdue_tasks: 2 });
    expect(statusReason(quiet, today)).toBe('No activity for 49 days and 2 overdue tasks');
    const burned = pkg({ status_pill: 'stuck', hours_used: 39 });
    expect(statusReason(burned, today)).toBe('98% of hours used');
    expect(statusReason(pkg(), today)).toBeNull();
    expect(statusReason(pkg({ status_pill: 'on_hold' }), today)).toBeNull();
  });

  it('summarises in plain sentences and says when nothing is active', () => {
    expect(summaryLines([], today)).toEqual(['You have no active packages right now.']);
    const lines = summaryLines([pkg({ overdue_tasks: 1, status_pill: 'drifting', hours_used: 31 })], today);
    expect(lines[0]).toBe('2 of 8 stages are complete across your package.');
    expect(lines[1]).toBe('You have used 78% of your consulting hours, with 9 hours left.');
    expect(lines[2]).toBe('1 task is overdue and worth clearing first.');
    expect(lines[3]).toContain('may need a check-in');
  });
});
