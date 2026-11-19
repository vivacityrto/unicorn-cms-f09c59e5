import { addDays, sydneyDate } from '@/features/eos-scorecard/scorecardView';

/** The scorecard week is keyed by its Monday; the weekly snapshot by the Sunday that ends it. */
export const weekEndingOf = (weekKey: string): string => addDays(weekKey, 6);

/** Whether a timestamp falls on a Sydney calendar day between two yyyy-mm-dd dates, inclusive. */
export function inSydneyRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const day = sydneyDate(new Date(iso));
  return day >= from && day <= to;
}

export interface CertificateRow {
  id: string;
  learner: string;
  client: string;
  course: string;
  issuedAt: string;
  number: string | null;
}

export interface CourseActivity {
  title: string;
  enrolled: number;
  completed: number;
}

export interface TenantAcademy {
  enrolled: number;
  completed: number;
}

/** The only enrolment source that counts: a learner chose the course themselves. */
export const CHOSEN_SOURCE = 'self_enrol';

export interface AcademyActivity {
  /** Courses learners chose for themselves. Nothing else is counted. */
  enrolled: number;
  /** Of those chosen courses, how many were finished in the window. */
  completed: number;
  /** Enrolments and completions left out because the learner did not choose them (automatic, mandatory, staff-made). */
  notCounted: { enrolled: number; completed: number };
  topCourses: CourseActivity[];
  /** Courses learners chose but nobody finished. */
  stalled: CourseActivity[];
  /** Enrolments and completions per client, so the report can say which clients use the Academy. */
  byTenant: Record<number, TenantAcademy>;
}

export interface EnrolmentLite {
  course_id: string;
  source: string | null;
  tenant_id?: number;
}

function courseTotals(enrolled: readonly EnrolmentLite[], completed: readonly EnrolmentLite[], titles: Readonly<Record<string, string>>): CourseActivity[] {
  const totals = new Map<string, CourseActivity>();
  const entry = (id: string) => {
    const existing = totals.get(id);
    if (existing) return existing;
    const created = { title: titles[id] ?? 'A course', enrolled: 0, completed: 0 };
    totals.set(id, created);
    return created;
  };
  for (const e of enrolled) entry(e.course_id).enrolled += 1;
  for (const c of completed) entry(c.course_id).completed += 1;
  return [...totals.values()];
}

/** What learners chose in the Academy over the window, what they finished, and where it stalled. Courses added for them are only counted as left out. */
export function buildAcademyActivity(allEnrolled: readonly EnrolmentLite[], allCompleted: readonly EnrolmentLite[], titles: Readonly<Record<string, string>>): AcademyActivity {
  // An allowlist, not a denylist: any other source, including ones added later, is left out by default.
  const chosen = (e: EnrolmentLite) => e.source === CHOSEN_SOURCE;
  const enrolled = allEnrolled.filter(chosen);
  const completed = allCompleted.filter(chosen);
  const courses = courseTotals(enrolled, completed, titles);
  const byTenant: Record<number, TenantAcademy> = {};
  const tenant = (id: number) => (byTenant[id] ??= { enrolled: 0, completed: 0 });
  for (const e of enrolled) if (e.tenant_id !== undefined) tenant(e.tenant_id).enrolled += 1;
  for (const c of completed) if (c.tenant_id !== undefined) tenant(c.tenant_id).completed += 1;
  return {
    enrolled: enrolled.length,
    completed: completed.length,
    notCounted: { enrolled: allEnrolled.length - enrolled.length, completed: allCompleted.length - completed.length },
    topCourses: [...courses].sort((a, b) => b.enrolled + b.completed - (a.enrolled + a.completed) || a.title.localeCompare(b.title)).slice(0, 5),
    stalled: courses
      .filter((c) => c.enrolled >= 3 && c.completed === 0)
      .sort((a, b) => b.enrolled - a.enrolled || a.title.localeCompare(b.title))
      .slice(0, 5),
    byTenant,
  };
}

export interface NeverSignedInPerson {
  id: string;
  name: string;
  client: string;
  addedOn: string | null;
}
