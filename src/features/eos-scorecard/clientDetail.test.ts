import { describe, expect, it } from 'vitest';
import { parseClientDetail, personNote, personStatus, summarisePeople } from './clientDetail';

const person = (over: Record<string, unknown> = {}) => ({
  user_id: 'u1',
  name: 'Sam Lee',
  email: 'sam@example.com',
  role: 'User',
  primary_contact: false,
  last_sign_in_at: '2026-11-10T00:00:00Z',
  last_active_at: '2026-11-12T00:00:00Z',
  active: true,
  pages: 3,
  logins: 1,
  messages: 0,
  lessons: 2,
  courses: [{ title: 'Intro', status: 'completed', enrolled_at: '2026-10-01T00:00:00Z', completed_at: '2026-11-01T00:00:00Z', chosen_by_learner: true }],
  certificates: [{ course: 'Intro', issued_at: '2026-11-12T00:00:00Z', this_week: true }],
  ...over,
});

describe('parseClientDetail', () => {
  it('reads a person with their courses and certificates', () => {
    const [p] = parseClientDetail({ people: [person()] });
    expect(p).toMatchObject({ userId: 'u1', name: 'Sam Lee', active: true, pages: 3, lessons: 2 });
    expect(p.courses[0]).toMatchObject({ title: 'Intro', chosenByLearner: true });
    expect(p.certificates[0]).toMatchObject({ course: 'Intro', thisWeek: true });
  });

  it('falls back to the email, then a plain label, when there is no name', () => {
    expect(parseClientDetail({ people: [person({ name: null })] })[0].name).toBe('sam@example.com');
    expect(parseClientDetail({ people: [person({ name: null, email: null })] })[0].name).toBe('Unnamed person');
  });

  it('skips anything that is not shaped as expected', () => {
    expect(parseClientDetail(null)).toEqual([]);
    expect(parseClientDetail({ people: 'nope' })).toEqual([]);
    expect(parseClientDetail({ people: [{ name: 'No id' }, 7, person()] })).toHaveLength(1);
  });
});

describe('personStatus', () => {
  it('never signed in wins over active', () => {
    expect(personStatus({ active: true, lastSignInAt: null })).toBe('never');
    expect(personStatus({ active: false, lastSignInAt: '2026-01-01' })).toBe('quiet');
    expect(personStatus({ active: true, lastSignInAt: '2026-01-01' })).toBe('active');
  });
});

describe('summarisePeople', () => {
  it('counts each status once and totals certificates and finished courses', () => {
    const people = parseClientDetail({
      people: [person(), person({ user_id: 'u2', active: false }), person({ user_id: 'u3', last_sign_in_at: null, active: false, courses: [], certificates: [] })],
    });
    expect(summarisePeople(people)).toEqual({ total: 3, active: 1, quiet: 1, never: 1, certificatesThisWeek: 2, coursesFinished: 2 });
  });
});

describe('personNote', () => {
  it('says what stands out for each kind of person', () => {
    const [active, quiet, never] = parseClientDetail({ people: [person(), person({ user_id: 'u2', active: false }), person({ user_id: 'u3', last_sign_in_at: null, active: false })] });
    expect(personNote(active)).toBe('In the last 28 days: 3 pages viewed, 1 sign-in, 2 lessons finished.');
    expect(personNote(quiet)).toMatch(/nothing in the last 28 days/);
    expect(personNote(never)).toMatch(/never signed in/);
  });
});
