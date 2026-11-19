import { useMemo } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import { AlertTriangle, Award, BookOpen, Clock3, GraduationCap, Sparkles, Users } from "lucide-react";
import { useTenantAcademyLearnerAnalytics, type TenantAcademyLearnerAnalytics } from "@/features/pdp/useTenantAcademyStaffStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bar, Ring } from "./home/Ring";
import { WeeklyBars } from "./academy-analytics/WeeklyBars";
import { STATUS_LABEL, academySummary, finishedPercent, hoursOf, learnerStatus, type LearnerStatus } from "./academy-analytics/academyInsights";

const numberAU = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

function relativeDate(value: string | null) {
  if (!value) return "Never";
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

const STATUS_CLASS: Record<LearnerStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  quiet: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  not_started: "border-border bg-muted text-muted-foreground",
  all_done: "border-primary/30 bg-primary/10 text-[var(--badge-default-fg)]",
};

function Tile({ icon: Icon, label, value, note, ring }: { icon: typeof Users; label: string; value: string; note: string; ring?: number }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
      {ring !== undefined ? (
        <Ring value={ring} label={`${label}: ${ring}%`}>{ring}%</Ring>
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-6 w-6" aria-hidden /></span>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold leading-tight tabular-nums text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

function Learners({ rows }: { rows: TenantAcademyLearnerAnalytics["learners"] }) {
  return (
    <div className="divide-y">
      {rows.map((l) => {
        const status = learnerStatus(l);
        const pct = finishedPercent(l.chosen, l.finished);
        return (
          <div key={l.user_id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_0.6fr_0.6fr_0.9fr] md:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{l.name}</p>
              <p className="truncate text-xs text-muted-foreground">{l.email || "No email"}</p>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Finished</span><span className="tabular-nums">{l.finished} of {l.chosen}</span></div>
              <Bar value={pct} tone={pct === 100 ? "good" : "primary"} label={`${l.name}: ${l.finished} of ${l.chosen} courses finished`} />
            </div>
            <div><p className="text-xs text-muted-foreground">Lessons</p><p className="text-sm font-medium tabular-nums">{l.lessons_completed}</p></div>
            <div><p className="text-xs text-muted-foreground">Hours</p><p className="text-sm font-medium tabular-nums">{numberAU.format(hoursOf(l.minutes))}</p></div>
            <div className="flex flex-col items-start gap-1">
              <Badge variant="outline" className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
              <span className="text-xs text-muted-foreground">{relativeDate(l.last_active)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AcademyActivityDashboard({ tenantId }: { tenantId: number }) {
  const { data, isLoading, error } = useTenantAcademyLearnerAnalytics(tenantId);
  const lines = useMemo(() => (data ? academySummary(data) : []), [data]);

  if (isLoading) return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>;
  if (error || !data) return <Card><CardContent className="p-6 text-sm text-destructive">Failed to load Academy activity.</CardContent></Card>;

  const t = data.totals;
  if (t.chosen === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-3 font-semibold">No courses chosen yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Once your team starts choosing courses in the Academy, this page will show progress, activity and who may need a nudge.</p>
          {t.not_counted.enrolments > 0 && <p className="mt-3 text-xs text-muted-foreground">{t.not_counted.enrolments} courses were added for your team by Vivacity. They are not counted here because your team did not choose them.</p>}
        </CardContent>
      </Card>
    );
  }

  const finishedPct = finishedPercent(t.chosen, t.finished);
  return (
    <div className="space-y-6">
      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={Users} label="Active learners" value={`${t.active_30d} of ${t.learners}`} note="active in the last 30 days" ring={t.learners ? Math.round((t.active_30d / t.learners) * 100) : 0} />
        <Tile icon={GraduationCap} label="Courses finished" value={`${t.finished} of ${t.chosen}`} note="chosen by your team" ring={finishedPct} />
        <Tile icon={BookOpen} label="Lessons completed" value={String(t.lessons_completed)} note="across chosen courses" />
        <Tile icon={Clock3} label="Learning time" value={`${numberAU.format(hoursOf(t.minutes))} h`} note={`${t.certificates} ${t.certificates === 1 ? "certificate" : "certificates"} earned`} />
      </section>

      <section aria-label="At a glance" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> At a glance</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {lines.map((l) => (
            <li key={l} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span>{l}</span></li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Learning each week</CardTitle></CardHeader>
          <CardContent><WeeklyBars weeks={data.trend} /></CardContent>
        </Card>
        <Card className={data.stalled.length ? "border-amber-500/40" : undefined}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />Worth a check-in</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.stalled.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has a course sitting untouched for more than 30 days.</p>
            ) : (
              data.stalled.slice(0, 6).map((s, i) => (
                <div key={`${s.name}-${s.course_title}-${i}`} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.course_title}: untouched for {s.days_quiet} days.</p>
                </div>
              ))
            )}
            {data.stalled.length > 6 && <p className="text-xs text-muted-foreground">+ {data.stalled.length - 6} more courses are sitting untouched.</p>}
            <Button variant="outline" size="sm" asChild className="mt-1 w-full"><Link to="/client/staff-pdps">Review Staff PDPs</Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-primary" aria-hidden />Your team</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_0.6fr_0.6fr_0.9fr] gap-3 border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>Team member</span><span>Progress</span><span>Lessons</span><span>Hours</span><span>Status</span></div>
          <Learners rows={data.learners} />
        </CardContent>
      </Card>

      {data.courses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Courses</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">Course</th><th className="pb-3 text-right">Chosen</th><th className="pb-3 text-right">Started</th><th className="pb-3 text-right">Finished</th><th className="pb-3 text-right">Certified</th><th className="pb-3 text-right">Untouched 30 days</th><th className="pb-3 text-right">Median days</th></tr></thead>
              <tbody>
                {data.courses.slice(0, 10).map((c) => (
                  <tr key={c.course_id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{c.course_title}</td><td className="py-3 text-right tabular-nums">{c.chosen}</td><td className="py-3 text-right tabular-nums">{c.started}</td><td className="py-3 text-right tabular-nums">{c.finished}</td><td className="py-3 text-right tabular-nums">{c.certified}</td><td className="py-3 text-right tabular-nums">{c.stalled}</td><td className="py-3 text-right tabular-nums">{c.median_days ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.courses.length > 10 && <p className="mt-3 text-xs text-muted-foreground">Showing the 10 most chosen of {data.courses.length} courses.</p>}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        These figures count courses your team chose themselves.
        {t.not_counted.enrolments > 0 ? ` ${t.not_counted.enrolments} ${t.not_counted.enrolments === 1 ? "course was" : "courses were"} added for your team another way and ${t.not_counted.enrolments === 1 ? "is" : "are"} not counted.` : ""}
        {data.last_updated_at ? ` Updated ${relativeDate(data.last_updated_at)}.` : ""}
      </p>
    </div>
  );
}
