import { describe, expect, it } from 'vitest';
import type { TenantAcademyLearnerAnalytics } from '@/features/pdp/useTenantAcademyStaffStats';
import { academySummary, finishedPercent, hoursOf, learnerStatus } from './academyInsights';

const today = new Date('2026-11-19T00:00:00Z');
type L = TenantAcademyLearnerAnalytics['learners'][number];
const learner = (over: Partial<L> = {}): L => ({ user_id: 'u', name: 'A', email: null, chosen: 3, finished: 1, lessons_completed: 5, minutes: 90, last_active: '2026-11-10T00:00:00Z', any_started: true, ...over });

const analytics = (over: Partial<TenantAcademyLearnerAnalytics> = {}): TenantAcademyLearnerAnalytics => ({
  last_updated_at: '2026-11-19T00:00:00Z',
  counted_source: 'self_enrol',
  totals: { learners: 3, chosen: 10, finished: 4, certificates: 3, lessons_completed: 40, minutes: 600, active_30d: 1, not_counted: { enrolments: 20, finished: 2 } },
  trend: Array.from({ length: 12 }, (_, i) => ({ week_start: `2026-0${(i % 9) + 1}-01`, active_learners: 1, chosen: 0, finished: 0, lessons: i < 8 ? 10 : 2 })),
  courses: [{ course_id: 1, course_title: 'Governance basics', chosen: 6, started: 5, finished: 3, certified: 3, stalled: 1, median_days: 9 }],
  learners: [learner(), learner({ user_id: 'v', last_active: '2026-09-01T00:00:00Z' }), learner({ user_id: 'w', any_started: false, finished: 0, last_active: null })],
  stalled: [],
  ...over,
});

describe('academy insights', () => {
  it('classifies learners', () => {
    expect(learnerStatus(learner(), today)).toBe('active');
    expect(learnerStatus(learner({ last_active: '2026-09-01T00:00:00Z' }), today)).toBe('quiet');
    expect(learnerStatus(learner({ any_started: false, finished: 0 }), today)).toBe('not_started');
    expect(learnerStatus(learner({ chosen: 2, finished: 2 }), today)).toBe('all_done');
  });

  it('works out percentages and hours safely', () => {
    expect(finishedPercent(0, 0)).toBe(0);
    expect(finishedPercent(10, 4)).toBe(40);
    expect(hoursOf(90)).toBe(1.5);
  });

  it('summarises the team in plain sentences', () => {
    const lines = academySummary(analytics(), today);
    expect(lines[0]).toBe('3 team members chose 10 courses and finished 4 (40%).');
    expect(lines[1]).toContain('1 of 3 are active in the last 30 days.');
    expect(lines[1]).toContain('1 person has gone quiet.');
    expect(lines[1]).toContain('1 person has chosen a course but not started it.');
    expect(lines[2]).toBe('Your team has completed 40 lessons, about 10 hours of learning.');
    expect(lines[3]).toBe('Governance basics is the most chosen course (6 people).');
    expect(lines[4]).toBe('Learning has slowed over the last four weeks compared with the four before.');
  });

  it('says so when nobody has chosen a course', () => {
    const empty = analytics({ totals: { ...analytics().totals, chosen: 0, learners: 0 } });
    expect(academySummary(empty, today)).toEqual(['Nobody on your team has chosen a course yet.']);
  });
});
