import { describe, expect, it } from 'vitest';
import { buildAcademyActivity, inSydneyRange, weekEndingOf } from './metricReport';

describe('weekEndingOf', () => {
  it('turns the Monday that keys a week into the Sunday that ends it', () => {
    expect(weekEndingOf('2026-11-09')).toBe('2026-11-15');
  });
});

describe('inSydneyRange', () => {
  it('uses the Sydney calendar day, not UTC', () => {
    // 14:30 UTC on 15 Nov is 1:30 am on 16 Nov in Sydney, so it is not in the week ending the 15th.
    expect(inSydneyRange('2026-11-15T14:30:00Z', '2026-11-09', '2026-11-15')).toBe(false);
    expect(inSydneyRange('2026-11-15T12:30:00Z', '2026-11-09', '2026-11-15')).toBe(true);
    expect(inSydneyRange('2026-11-08T12:30:00Z', '2026-11-09', '2026-11-15')).toBe(false);
  });

  it('is false for a missing timestamp', () => {
    expect(inSydneyRange(null, '2026-11-09', '2026-11-15')).toBe(false);
  });
});

describe('buildAcademyActivity', () => {
  const titles = { a: 'Governance basics', b: 'Credential policy', c: 'Student support' };
  const enrolled = [
    { course_id: 'a', source: 'self_enrol' },
    { course_id: 'a', source: 'auto_package' },
    { course_id: 'b', source: 'auto_all_clients' },
    { course_id: 'b', source: 'auto_all_clients' },
    { course_id: 'b', source: 'auto_all_clients' },
    { course_id: 'c', source: 'manual' },
  ];

  it('splits how people were enrolled', () => {
    const r = buildAcademyActivity(enrolled, [{ course_id: 'a', source: null }], titles);
    expect(r).toMatchObject({ enrolled: 6, selfEnrolled: 1, automatic: 4, other: 1, completed: 1 });
  });

  it('ranks courses by activity and flags courses with enrolments but no completions', () => {
    const r = buildAcademyActivity(enrolled, [{ course_id: 'a', source: null }], titles);
    expect(r.topCourses[0].title).toBe('Credential policy');
    expect(r.stalled).toEqual([{ title: 'Credential policy', enrolled: 3, completed: 0 }]);
  });

  it('copes with a quiet window', () => {
    const r = buildAcademyActivity([], [], titles);
    expect(r).toMatchObject({ enrolled: 0, completed: 0, topCourses: [], stalled: [] });
  });
});
