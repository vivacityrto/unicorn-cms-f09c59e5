import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { TenantAcademyLearnerAnalytics } from '@/features/pdp/useTenantAcademyStaffStats';

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
