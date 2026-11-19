import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcademyEngagement, type EngagementFilters } from '@/hooks/academy/useAcademyEngagement';
import { completionRate, rankCourses, validateCohortDates, type EngagementSort } from '@/lib/academy/engagementDashboard';
import { ResponsiveTableShell, ResponsiveTableView } from '@/components/ui/responsive-table';
import { FormSection } from '@/components/ui/form-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AcademyEngagementDashboard({ tenants }: { tenants: Array<{ id: number; name: string }> }) {
  const [filters, setFilters] = useState<EngagementFilters>({ from: '', to: '', tenantId: 'all', source: 'self_enrol' });
  const [sort, setSort] = useState<EngagementSort>('completed');
  const query = useAcademyEngagement(filters);
  const valid = validateCohortDates(filters.from, filters.to);
  const data = valid && !query.isError ? query.data : undefined;
  const update = (value: Partial<EngagementFilters>) => setFilters(prev => ({ ...prev, ...value }));
  const enrolmentLink = (courseId: number) => {
    const params = new URLSearchParams({ course: String(courseId) });
    if (filters.source === 'self_enrol') params.set('source', 'self_enrol');
    if (filters.tenantId !== 'all') params.set('tenant', filters.tenantId);
    return `/superadmin/academy/enrollments?${params}`;
  };
  const selectClass = 'block h-11 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm';
  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle>Academy engagement dashboard</CardTitle>
      <p className="text-sm text-muted-foreground">Which courses do people choose, start and complete? Learner-chosen courses are shown first so automatic access is not mistaken for demand.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <FormSection first><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm space-y-1">Enrolled from (Sydney time)<Input type="date" value={filters.from} onChange={e => update({ from: e.target.value })} /></label>
        <label className="text-sm space-y-1">Enrolled to (inclusive)<Input type="date" value={filters.to} onChange={e => update({ to: e.target.value })} /></label>
        <label className="text-sm space-y-1">Customer<select className={selectClass} value={filters.tenantId} onChange={e => update({ tenantId: e.target.value })}>
          <option value="all">All customer learners</option>
          {tenants.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}
        </select></label>
        <label className="text-sm space-y-1">Enrolment source<select className={selectClass} value={filters.source} onChange={e => update({ source: e.target.value as EngagementFilters['source'] })}>
          <option value="self_enrol">Learner-chosen only</option><option value="all">All sources (including automatic)</option>
        </select></label>
      </div></FormSection>
      <p className="text-sm text-muted-foreground">Dates select the enrolment cohort, not the date of viewing or completion. Outcomes are the current snapshot for that cohort. Vivacity internal/system profiles and revoked enrolments are excluded; expired enrolments remain in the denominator.</p>
      {!valid && <p role="alert" className="text-destructive">Enter valid dates with the start on or before the end.</p>}
      {query.isError && <div role="alert" className="space-y-2"><p>Engagement data could not be loaded. No zero totals have been substituted. The reporting function may not yet be available, or your access may not permit it.</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>}
      {valid && query.isLoading && <p role="status">Loading Academy engagement…</p>}
      {data && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ['Enrolments', data.totals.enrolments], ['Distinct learners', data.totals.learners],
            ['Learners with video activity', data.totals.video_started], ['Courses completed', data.totals.completed],
            ['Completion rate', completionRate(data.totals.completed, data.totals.enrolments)], ['Certificates issued', data.totals.certificates],
          ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm space-y-1">Rank courses by<select className={selectClass} value={sort} onChange={e => setSort(e.target.value as EngagementSort)}>
            <option value="completed">Completions</option><option value="enrolments">Enrolments</option><option value="video_started">Learners with video activity</option><option value="certificates">Certificates</option>
          </select></label>
          <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? 'Refreshing…' : 'Refresh data'}</Button>
        </div>
        <ResponsiveTableView items={rankCourses(data.courses, sort)} keyExtractor={c => c.course_id}
          emptyState="No enrolments match this cohort."
          renderCard={c => <article className="rounded-lg border p-4 space-y-3 break-words">
            <h3 className="font-medium text-sm">{c.title}</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Enrolments', c.enrolments], ['Distinct learners', c.learners], ['Video activity', c.video_started],
                ['Completed', c.completed], ['Completion rate', completionRate(c.completed, c.enrolments)], ['Certificates', c.certificates],
              ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
            </dl>
            <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" to={enrolmentLink(c.course_id)}>Review enrolments (all dates/statuses)</Link>
          </article>}
          renderTable={() => <ResponsiveTableShell><Table>
          <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Enrolments</TableHead><TableHead>Distinct learners</TableHead><TableHead>Video activity</TableHead><TableHead>Completed</TableHead><TableHead>Completion rate</TableHead><TableHead>Certificates</TableHead></TableRow></TableHeader>
          <TableBody>{rankCourses(data.courses, sort).map(c => {
            return <TableRow key={c.course_id}><TableCell><p className="font-medium">{c.title}</p><Link className="text-xs text-primary underline" to={enrolmentLink(c.course_id)}>Review enrolments (all dates/statuses)</Link></TableCell><TableCell>{c.enrolments}</TableCell><TableCell>{c.learners}</TableCell><TableCell>{c.video_started}</TableCell><TableCell>{c.completed}</TableCell><TableCell>{completionRate(c.completed, c.enrolments)}</TableCell><TableCell>{c.certificates}</TableCell></TableRow>;
          })}{data.courses.length === 0 && <TableRow><TableCell colSpan={7}>No enrolments match this cohort.</TableCell></TableRow>}</TableBody>
        </Table></ResponsiveTableShell>} />
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Video activity means a saved video start or playback position. It does not prove the whole video was watched: playback position is not watch time and may include seeking. Historic or untracked viewing cannot be recovered here.</p>
          <p>Completion rate = recorded completed enrolments ÷ all enrolments in this cohort. Certificates are issued, non-revoked records (including expired certificates), counted separately from completion. Course learner counts can overlap; the overall learner total is deduplicated.</p>
          <p>Snapshot: {new Date(data.generated_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} (Sydney time). This is recorded Academy activity, not live webinar attendance.</p>
        </div>
      </>}
    </CardContent>
  </Card>;
}
