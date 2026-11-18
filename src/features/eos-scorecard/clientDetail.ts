/** One client's people, as the report's drill-down shows them. Pure helpers; the data comes from get_cst_client_detail. */

export interface PersonCourse {
  title: string;
  status: string | null;
  enrolledAt: string | null;
  completedAt: string | null;
  chosenByLearner: boolean;
}

export interface PersonCertificate {
  course: string;
  issuedAt: string;
  thisWeek: boolean;
}

export interface ClientPerson {
  userId: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
  role: string | null;
  primaryContact: boolean;
  addedAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  /** Did something in the 28 days ending the week under review. */
  active: boolean;
  pages: number;
  logins: number;
  messages: number;
  lessons: number;
  courses: PersonCourse[];
  certificates: PersonCertificate[];
}

export type PersonStatus = 'active' | 'quiet' | 'never';

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isRecord) : []);

/** Reads the function's answer. Anything that is not shaped as expected is skipped rather than guessed at. */
export function parseClientDetail(raw: unknown): ClientPerson[] {
  if (!isRecord(raw)) return [];
  return list(raw.people).flatMap((p) => {
    const userId = text(p.user_id);
    if (!userId) return [];
    return [
      {
        userId,
        name: text(p.name) ?? text(p.email) ?? 'Unnamed person',
        email: text(p.email),
        jobTitle: text(p.job_title),
        role: text(p.role),
        primaryContact: p.primary_contact === true,
        addedAt: text(p.added_at),
        lastSignInAt: text(p.last_sign_in_at),
        lastActiveAt: text(p.last_active_at),
        active: p.active === true,
        pages: count(p.pages),
        logins: count(p.logins),
        messages: count(p.messages),
        lessons: count(p.lessons),
        courses: list(p.courses).map((c) => ({
          title: text(c.title) ?? 'A course',
          status: text(c.status),
          enrolledAt: text(c.enrolled_at),
          completedAt: text(c.completed_at),
          chosenByLearner: c.chosen_by_learner === true,
        })),
        certificates: list(p.certificates).flatMap((c) => {
          const issuedAt = text(c.issued_at);
          return issuedAt ? [{ course: text(c.course) ?? 'A course', issuedAt, thisWeek: c.this_week === true }] : [];
        }),
      },
    ];
  });
}

/** Never signed in wins: someone who has never been in cannot be called quiet. */
export const personStatus = (p: Pick<ClientPerson, 'active' | 'lastSignInAt'>): PersonStatus => (p.lastSignInAt === null ? 'never' : p.active ? 'active' : 'quiet');

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = { active: 'Active', quiet: 'Quiet', never: 'Never signed in' };

export interface PeopleSummary {
  total: number;
  active: number;
  quiet: number;
  never: number;
  certificatesThisWeek: number;
  coursesFinished: number;
}

export function summarisePeople(people: readonly ClientPerson[]): PeopleSummary {
  const by = { active: 0, quiet: 0, never: 0 };
  for (const p of people) by[personStatus(p)] += 1;
  return {
    total: people.length,
    ...by,
    certificatesThisWeek: people.reduce((n, p) => n + p.certificates.filter((c) => c.thisWeek).length, 0),
    coursesFinished: people.reduce((n, p) => n + p.courses.filter((c) => c.completedAt !== null).length, 0),
  };
}

/** What to say about a person the room should look at: the one thing most worth knowing. */
export function personNote(p: ClientPerson): string {
  const status = personStatus(p);
  if (status === 'never') return 'Invited, but has never signed in.';
  if (status === 'quiet') return 'Has signed in before, but did nothing in the last 28 days.';
  const bits = [
    p.pages > 0 ? `${p.pages} ${p.pages === 1 ? 'page' : 'pages'} viewed` : null,
    p.logins > 0 ? `${p.logins} ${p.logins === 1 ? 'sign-in' : 'sign-ins'}` : null,
    p.messages > 0 ? `${p.messages} ${p.messages === 1 ? 'message' : 'messages'}` : null,
    p.lessons > 0 ? `${p.lessons} ${p.lessons === 1 ? 'lesson' : 'lessons'} finished` : null,
  ].filter((b): b is string => b !== null);
  return bits.length > 0 ? `In the last 28 days: ${bits.join(', ')}.` : 'Active in the last 28 days.';
}
