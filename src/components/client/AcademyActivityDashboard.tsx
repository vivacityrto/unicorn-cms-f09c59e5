import { useMemo } from "react";
import { differenceInDays, formatDistanceToNow, parseISO } from "date-fns";
import { Activity, AlertTriangle, Award, BarChart3, BookOpen, Clock3, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useTenantAcademyAnalytics,
  useTenantAcademyStaffStats,
  type TenantAcademyStaffStatsRow,
} from "@/features/pdp/useTenantAcademyStaffStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const numberAU = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function relativeDate(value: string | null) {
  if (!value) return "Never";
  try { return formatDistanceToNow(parseISO(value), { addSuffix: true }); } catch { return "Unknown"; }
}

function daysSince(value: string | null) {
  if (!value) return null;
  try { return differenceInDays(new Date(), parseISO(value)); } catch { return null; }
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string | number; detail?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
            {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffActivityTable({ rows }: { rows: TenantAcademyStaffStatsRow[] }) {
  return (
    <div className="divide-y">
      {rows.map((row) => {
        const total = Number(row.enrollments_total ?? 0);
        const completed = Number(row.enrollments_completed ?? 0);
        const completion = total ? Math.round((completed / total) * 100) : 0;
        return (
          <div key={row.user_id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_1fr] md:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{row.full_name || "Unnamed staff member"}</p><p className="truncate text-xs text-muted-foreground">{row.email || "No email"}</p></div>
            <div><p className="text-xs text-muted-foreground">Courses</p><p className="text-sm font-medium">{completed}/{total} complete</p></div>
            <div><p className="text-xs text-muted-foreground">PD hours</p><p className="text-sm font-medium">{numberAU.format(Number(row.pd_hours_completed ?? 0))}</p></div>
            <div><div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Engagement</span><span>{relativeDate(row.last_activity_at)}</span></div><Progress value={completion} className="h-1.5" /></div>
          </div>
        );
      })}
    </div>
  );
}

export function AcademyActivityDashboard({ tenantId }: { tenantId: number }) {
  const { data = [], isLoading, error } = useTenantAcademyStaffStats(tenantId);
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useTenantAcademyAnalytics(tenantId);
  const summary = useMemo(() => {
    const totalEnrollments = data.reduce((sum, row) => sum + Number(row.enrollments_total ?? 0), 0);
    const completed = data.reduce((sum, row) => sum + Number(row.enrollments_completed ?? 0), 0);
    const active = data.filter((row) => { const days = daysSince(row.last_activity_at); return days !== null && days <= 30; }).length;
    const inactive = data.filter((row) => { const days = daysSince(row.last_activity_at); return days === null || days > 30; });
    const inProgress = data.reduce((sum, row) => sum + Number(row.enrollments_active ?? 0), 0);
    const certificates = data.reduce((sum, row) => sum + Number(row.certificates_earned ?? 0), 0);
    const hours = data.reduce((sum, row) => sum + Number(row.pd_hours_completed ?? 0), 0);
    return { totalEnrollments, completed, active, inactive, inProgress, certificates, hours, completionRate: totalEnrollments ? Math.round((completed / totalEnrollments) * 100) : 0 };
  }, [data]);

  if (isLoading) return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div>;
  if (error) return <Card><CardContent className="p-6 text-sm text-destructive">Failed to load Academy activity.</CardContent></Card>;
  if (!data.length) return <Card className="border-dashed"><CardContent className="p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-3 font-semibold">No Academy activity yet</h3><p className="mt-1 text-sm text-muted-foreground">Once staff start learning, this dashboard will show engagement, progress, and actions.</p></CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Staff tracked" value={data.length} detail={`${summary.active} active in the last 30 days`} />
        <MetricCard icon={BookOpen} label="Completion rate" value={`${summary.completionRate}%`} detail={`${summary.completed} of ${summary.totalEnrollments} enrollments complete`} />
        <MetricCard icon={Clock3} label="PD hours completed" value={numberAU.format(summary.hours)} detail={`${summary.inProgress} courses in progress`} />
        <MetricCard icon={Award} label="Certificates earned" value={summary.certificates} detail="Across this organisation" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" />Staff learning activity</CardTitle></CardHeader>
          <CardContent className="p-0"><div className="hidden grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_1fr] gap-3 border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>Staff member</span><span>Courses</span><span>PD hours</span><span>Recent activity</span></div><StaffActivityTable rows={data} /></CardContent>
        </Card>
        <Card className={summary.inactive.length ? "border-amber-300" : undefined}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" />Actions to consider</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {summary.inactive.length === 0 ? <p className="text-sm text-muted-foreground">No inactive staff detected in the last 30 days.</p> : summary.inactive.slice(0, 5).map((row) => <div key={row.user_id} className="rounded-lg border bg-amber-50/50 p-3"><p className="text-sm font-medium">Check in with {row.full_name || "this staff member"}</p><p className="mt-1 text-xs text-muted-foreground">Last Academy activity: {relativeDate(row.last_activity_at)}.</p></div>)}
            {summary.inactive.length > 5 && <p className="text-xs text-muted-foreground">+ {summary.inactive.length - 5} more staff may need a check-in.</p>}
            <Button variant="outline" size="sm" asChild className="mt-2 w-full"><Link to="/client/staff-pdps">Review Staff PDPs</Link></Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" />Learning funnel</CardTitle></CardHeader>
          <CardContent>
            {analyticsLoading ? <Skeleton className="h-40 w-full" /> : analyticsError ? <p className="text-sm text-muted-foreground">Course funnel data is temporarily unavailable.</p> : (
              <div className="space-y-4">
                {[
                  ["Enrolled", analytics?.courses.reduce((sum, course) => sum + course.enrolled, 0) ?? 0],
                  ["Started", analytics?.courses.reduce((sum, course) => sum + course.started, 0) ?? 0],
                  ["In progress", analytics?.courses.reduce((sum, course) => sum + course.in_progress, 0) ?? 0],
                  ["Completed", analytics?.courses.reduce((sum, course) => sum + course.completed, 0) ?? 0],
                  ["Certified", analytics?.courses.reduce((sum, course) => sum + course.certified, 0) ?? 0],
                ].map(([label, value]) => {
                  const count = Number(value);
                  const enrolled = analytics?.courses.reduce((sum, course) => sum + course.enrolled, 0) ?? 0;
                  return <div key={String(label)}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-medium">{count}</span></div><Progress value={enrolled ? (count / enrolled) * 100 : 0} className="h-2" /></div>;
                })}
                <p className="text-xs text-muted-foreground">Based on current tenant enrolments. Started includes any recorded lesson progress.</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Weekly activity</CardTitle></CardHeader>
          <CardContent>
            {analyticsLoading ? <Skeleton className="h-40 w-full" /> : analyticsError ? <p className="text-sm text-muted-foreground">Weekly activity data is temporarily unavailable.</p> : analytics?.trend.length ? <div className="space-y-3">{analytics.trend.slice(-6).map((week) => <div key={week.week_start} className="flex items-center gap-3"><span className="w-20 text-xs text-muted-foreground">{week.week_start}</span><div className="flex-1"><Progress value={Math.min(100, week.active_learners * 10)} className="h-2" /></div><span className="w-20 text-right text-xs font-medium">{week.active_learners} active</span></div>)}</div> : <p className="text-sm text-muted-foreground">No weekly activity recorded yet.</p>}
            {analytics?.last_updated_at && <p className="mt-4 text-xs text-muted-foreground">Updated {relativeDate(analytics.last_updated_at)}.</p>}
          </CardContent>
        </Card>
      </div>

      {analytics?.courses.length ? <Card><CardHeader><CardTitle className="text-base">Course performance</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">Course</th><th className="pb-3 text-right">Enrolled</th><th className="pb-3 text-right">Started</th><th className="pb-3 text-right">Completed</th><th className="pb-3 text-right">Certified</th><th className="pb-3 text-right">Median days</th></tr></thead><tbody>{analytics.courses.slice(0, 8).map((course) => <tr key={course.course_id} className="border-b last:border-0"><td className="py-3 font-medium">{course.course_title}</td><td className="py-3 text-right">{course.enrolled}</td><td className="py-3 text-right">{course.started}</td><td className="py-3 text-right">{course.completed}</td><td className="py-3 text-right">{course.certified}</td><td className="py-3 text-right">{course.median_completion_days ?? "—"}</td></tr>)}</tbody></table></CardContent></Card> : null}
    </div>
  );
}
