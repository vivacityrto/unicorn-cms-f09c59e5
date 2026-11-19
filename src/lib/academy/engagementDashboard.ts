import { z } from 'zod';

const count = z.number().int().nonnegative();
const metrics = z.object({
  enrolments: count, learners: count, video_started: count,
  completed: count, certificates: count,
});
export const academyEngagementSchema = z.object({
  generated_at: z.string(),
  totals: metrics,
  courses: z.array(metrics.extend({ course_id: z.number(), title: z.string() })),
});
export type AcademyEngagement = z.infer<typeof academyEngagementSchema>;
export type EngagementSort = 'enrolments' | 'video_started' | 'completed' | 'certificates';
export function completionRate(completed: number, enrolments: number): string {
  return enrolments > 0 ? `${Math.round(100 * completed / enrolments)}%` : '—';
}
export function rankCourses(courses: AcademyEngagement['courses'], sort: EngagementSort) {
  return [...courses].sort((a, b) => b[sort] - a[sort] || a.title.localeCompare(b.title) || a.course_id - b.course_id);
}
export function validateCohortDates(from: string, to: string): boolean {
  const valid = (v: string) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
  return valid(from) && valid(to) && (!from || !to || from <= to);
}
