import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { TenantAcademyLearnerAnalytics, TenantAcademyLearnerDetail } from '@/features/pdp/useTenantAcademyStaffStats';

export type LearnerStatus = 'active' | 'quiet' | 'not_started' | 'all_done';

const ACTIVE_DAYS = 30;

/** Where one learner stands, in the words the table shows. */
export function learnerStatus(l: TenantAcademyLearnerAnalytics['learners'][number], today: Date = new Date()): LearnerStatus {
  if (l.chosen > 0 && l.finished >= l.chosen) return 'all_done';
  if (!l.any_started) return 'not_started';
  if (!l.last_active) return 'quiet';
  return differenceInCalendarDays(today, parseISO(l.last_active)) <= ACTIVE_DAYS ? 'active' : 'quiet';
}

export const STATUS_LABEL: Record<LearnerStatus, string> = {
  active: 'Active',
  quiet: 'Gone quiet',
  not_started: 'Not started',
  all_done: 'All finished',
};

export const finishedPercent = (chosen: number, finished: number) => (chosen > 0 ? Math.min(100, Math.round((finished / chosen) * 100)) : 0);

export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A few plain sentences about the team's learning, built only from the figures on the page. */
export function academySummary(a: TenantAcademyLearnerAnalytics, today: Date = new Date()): string[] {
  const t = a.totals;
  if (t.chosen === 0) return ['Nobody on your team has chosen a course yet.'];
  const lines: string[] = [];
  lines.push(`${plural(t.learners, 'team member')} chose ${plural(t.chosen, 'course')} and finished ${t.finished} (${finishedPercent(t.chosen, t.finished)}%).`);

  const quiet = a.learners.filter((l) => learnerStatus(l, today) === 'quiet').length;
  const notStarted = a.learners.filter((l) => learnerStatus(l, today) === 'not_started').length;
  lines.push(`${t.active_30d} of ${t.learners} ${t.learners === 1 ? 'is' : 'are'} active in the last 30 days.${quiet > 0 ? ` ${plural(quiet, 'person has', 'people have')} gone quiet.` : ''}${notStarted > 0 ? ` ${plural(notStarted, 'person has', 'people have')} chosen a course but not started it.` : ''}`);

  if (t.lessons_completed > 0) lines.push(`Your team has completed ${t.lessons_completed} lessons, about ${hoursOf(t.minutes)} hours of learning.`);

  const top = [...a.courses].sort((x, y) => y.chosen - x.chosen)[0];
  if (top && top.chosen > 1) lines.push(`${top.course_title} is the most chosen course (${top.chosen} people).`);

  const last4 = a.trend.slice(-4).reduce((n, w) => n + w.lessons, 0);
  const prev4 = a.trend.slice(-8, -4).reduce((n, w) => n + w.lessons, 0);
  if (prev4 > 0 && last4 < prev4 * 0.5) lines.push('Learning has slowed over the last four weeks compared with the four before.');
  else if (prev4 > 0 && last4 > prev4 * 1.5) lines.push('Learning has picked up over the last four weeks.');
  return lines;
}

export type CourseState = 'finished' | 'in_progress' | 'quiet' | 'not_started';

export const COURSE_STATE_LABEL: Record<CourseState, string> = {
  finished: 'Finished',
  in_progress: 'In progress',
  quiet: 'Untouched 30+ days',
  not_started: 'Not started',
};

type DetailCourse = TenantAcademyLearnerDetail['courses'][number];
type DetailLearnerData = TenantAcademyLearnerDetail;

/** Where one chosen course stands for this person. */
export function courseState(c: DetailCourse, today: Date = new Date()): CourseState {
  if (c.completed_at) return 'finished';
  if (!c.started) return 'not_started';
  if (c.last_touch && differenceInCalendarDays(today, parseISO(c.last_touch)) > ACTIVE_DAYS) return 'quiet';
  return 'in_progress';
}

/** Lessons done as a whole percent of the course. A finished course reads 100 even if lessons were added since. */
export function lessonPercent(c: Pick<DetailCourse, 'lessons_completed' | 'lessons_total' | 'completed_at'>): number {
  if (c.completed_at) return 100;
  return c.lessons_total > 0 ? Math.min(100, Math.round((c.lessons_completed / c.lessons_total) * 100)) : 0;
}

/** Plain sentences about one person, built only from the figures in the panel. */
export function learnerSummary(d: DetailLearnerData, today: Date = new Date()): string[] {
  const t = d.totals;
  const lines: string[] = [];
  if (t.chosen === 0) return ['This person has not chosen any courses yet.'];
  lines.push(`Chose ${plural(t.chosen, 'course')} and finished ${t.finished}${t.certificates > 0 ? `, with ${plural(t.certificates, 'certificate')} earned` : ''}.`);
  lines.push(`${plural(t.lessons_completed, 'lesson')} completed${t.lessons_total > 0 ? ` of ${t.lessons_total}` : ''}, about ${hoursOf(t.minutes)} hours of learning.`);
  const states = d.courses.map((c) => courseState(c, today));
  const quiet = states.filter((s) => s === 'quiet').length;
  const notStarted = states.filter((s) => s === 'not_started').length;
  if (quiet > 0) lines.push(`${plural(quiet, 'course has', 'courses have')} not been touched for over 30 days.`);
  if (notStarted > 0) lines.push(`${plural(notStarted, 'course is', 'courses are')} chosen but not started.`);
  if (t.last_active) {
    const days = differenceInCalendarDays(today, parseISO(t.last_active));
    lines.push(days <= 0 ? 'Last active today.' : `Last active ${plural(days, 'day')} ago.`);
  }
  return lines;
}
