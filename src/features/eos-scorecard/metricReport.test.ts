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

  const chosenMore = [...enrolled, { course_id: 'a', source: 'self_enrol', tenant_id: 1 }, { course_id: 'a', source: 'self_enrol', tenant_id: 2 }, { course_id: 'a', source: 'self_enrol', tenant_id: 2 }];

  it('counts only courses the learner chose, and says how many were left out', () => {
    const r = buildAcademyActivity(enrolled, [{ course_id: 'a', source: 'self_enrol' }, { course_id: 'b', source: 'auto_all_clients' }], titles);
    expect(r).toMatchObject({ enrolled: 1, completed: 1, notCounted: { enrolled: 5, completed: 1 } });
  });

  it('leaves out every other source, including ones that do not exist yet', () => {
    const odd = [{ course_id: 'a', source: 'package_auto' }, { course_id: 'a', source: 'staff_impersonation' }, { course_id: 'a', source: 'manual' }, { course_id: 'a', source: null }, { course_id: 'a', source: 'brand_new_source' }];
    const r = buildAcademyActivity(odd, odd, titles);
    expect(r).toMatchObject({ enrolled: 0, completed: 0, notCounted: { enrolled: 5, completed: 5 }, topCourses: [], stalled: [], byTenant: {} });
  });

  it('ranks only chosen courses and flags those chosen three times with no completion', () => {
    const r = buildAcademyActivity(chosenMore, [], titles);
    expect(r.topCourses).toEqual([{ title: 'Governance basics', enrolled: 4, completed: 0 }]);
    expect(r.stalled).toEqual([{ title: 'Governance basics', enrolled: 4, completed: 0 }]);
  });

  it('counts a client as using the Academy only through courses its learners chose', () => {
    const r = buildAcademyActivity(
      [{ course_id: 'a', source: 'auto_package', tenant_id: 5 }, { course_id: 'a', source: 'self_enrol', tenant_id: 6 }],
      [{ course_id: 'a', source: 'auto_all_clients', tenant_id: 5 }],
      titles,
    );
    expect(r.byTenant).toEqual({ 6: { enrolled: 1, completed: 0 } });
  });

  it('copes with a quiet window', () => {
    const r = buildAcademyActivity([], [], titles);
    expect(r).toMatchObject({ enrolled: 0, completed: 0, notCounted: { enrolled: 0, completed: 0 }, topCourses: [], stalled: [] });
  });
});
