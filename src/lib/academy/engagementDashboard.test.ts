import { describe, expect, it } from 'vitest';
import { academyEngagementSchema, completionRate, rankCourses, validateCohortDates } from './engagementDashboard';

describe('Academy engagement metrics', () => {
  it('uses the whole enrolled cohort, not only starters, as denominator', () => {
    expect(completionRate(3, 12)).toBe('25%');
    expect(completionRate(0, 0)).toBe('—');
  });
  it('ranks by the selected outcome with stable title ties, without mutating', () => {
    const courses = [
      { course_id: 1, title: 'Zulu', enrolments: 9, learners: 9, video_started: 1, completed: 0, certificates: 0 },
      { course_id: 2, title: 'Alpha', enrolments: 3, learners: 3, video_started: 2, completed: 2, certificates: 1 },
    ];
    expect(rankCourses(courses, 'completed').map(c => c.course_id)).toEqual([2, 1]);
    expect(rankCourses(courses, 'enrolments').map(c => c.course_id)).toEqual([1, 2]);
    expect(courses[0].title).toBe('Zulu');
  });
  it('rejects invalid dates and reverse ranges', () => {
    expect(validateCohortDates('2026-11-19', '2026-11-18')).toBe(false);
    expect(validateCohortDates('2026-02-30', '')).toBe(false);
    expect(validateCohortDates('', '')).toBe(true);
    expect(validateCohortDates('2026-11-19', '2026-11-19')).toBe(true);
  });
  it('fails closed for malformed or absent metrics instead of showing zeroes', () => {
    expect(() => academyEngagementSchema.parse(null)).toThrow();
    expect(() => academyEngagementSchema.parse({ generated_at: 'now', totals: {}, courses: [] })).toThrow();
  });
});
