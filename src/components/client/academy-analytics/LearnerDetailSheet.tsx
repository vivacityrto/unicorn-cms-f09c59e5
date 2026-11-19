import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Award, BookOpen, Clock3, GraduationCap, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Bar } from "@/components/client/home/Ring";
import { useTenantAcademyLearnerDetail, type TenantAcademyLearnerAnalytics } from "@/features/pdp/useTenantAcademyStaffStats";
import { WeeklyBars } from "./WeeklyBars";
import { COURSE_STATE_LABEL, STATUS_LABEL, courseState, finishedPercent, hoursOf, learnerStatus, learnerSummary, lessonPercent, type CourseState, type LearnerStatus } from "./academyInsights";

const numberAU = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

const STATUS_CLASS: Record<LearnerStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  quiet: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  not_started: "border-border bg-muted text-muted-foreground",
  all_done: "border-primary/30 bg-primary/10 text-[var(--badge-default-fg)]",
};

const COURSE_CLASS: Record<CourseState, string> = {
  finished: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  in_progress: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  quiet: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  not_started: "border-border bg-muted text-muted-foreground",
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "unknown";
  }
};
const day = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return "—";
  }
};

function Tile({ icon: Icon, label, value, note }: { icon: typeof Award; label: string; value: string; note: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums leading-tight text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

/**
 * One team member's Academy activity as a mini page: their numbers, a weekly chart, what the figures say in words,
 * and every course they chose with progress. Opens from a row in "Your team".
 */
export function LearnerDetailSheet({
  tenantId,
  learner,
  onOpenChange,
}: {
  tenantId: number;
  learner: TenantAcademyLearnerAnalytics["learners"][number] | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useTenantAcademyLearnerDetail(tenantId, learner?.user_id);
  const status = learner ? learnerStatus(learner) : null;
  return (
    <Sheet open={!!learner} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {learner && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {learner.name}
                {status && <Badge variant="outline" className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>}
              </SheetTitle>
              <SheetDescription>{learner.email || "No email"} · last active {ago(learner.last_active)}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              {isLoading ? (
                <div className="space-y-3" aria-busy="true">
                  <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                  <Skeleton className="h-36 rounded-xl" />
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : error || !data ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Could not load this person's Academy activity. Close this and try again.</p>
              ) : (
                <>
                  <section aria-label="Key numbers" className="grid grid-cols-2 gap-3">
                    <Tile icon={GraduationCap} label="Courses finished" value={`${data.totals.finished} of ${data.totals.chosen}`} note={`${finishedPercent(data.totals.chosen, data.totals.finished)}% of those chosen`} />
                    <Tile icon={BookOpen} label="Lessons" value={String(data.totals.lessons_completed)} note={data.totals.lessons_total > 0 ? `of ${data.totals.lessons_total} in chosen courses` : "completed"} />
                    <Tile icon={Clock3} label="Learning time" value={`${numberAU.format(hoursOf(data.totals.minutes))} h`} note="time spent in lessons" />
                    <Tile icon={Award} label="Certificates" value={String(data.totals.certificates)} note={data.totals.certificates === 1 ? "earned" : "earned in total"} />
                  </section>

                  <section aria-label="At a glance" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> At a glance</h3>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {learnerSummary(data).map((l) => (
                        <li key={l} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span>{l}</span></li>
                      ))}
                    </ul>
                  </section>

                  <section aria-label="Learning each week" className="rounded-xl border bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold">Learning each week</h3>
                    <WeeklyBars weeks={data.trend} compact />
                  </section>

                  <section aria-label="Courses">
                    <h3 className="mb-2 text-sm font-semibold">Courses they chose</h3>
                    {data.courses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No courses chosen yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.courses.map((c) => {
                          const state = courseState(c);
                          const pct = lessonPercent(c);
                          return (
                            <li key={c.course_id} className="rounded-xl border bg-card p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="min-w-0 text-sm font-medium">{c.course_title}</p>
                                <Badge variant="outline" className={COURSE_CLASS[state]}>{COURSE_STATE_LABEL[state]}</Badge>
                              </div>
                              <div className="mt-2">
                                <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Lessons</span><span className="tabular-nums">{c.lessons_completed} of {c.lessons_total}</span></div>
                                <Bar value={pct} tone={pct === 100 ? "good" : "primary"} label={`${c.course_title}: ${c.lessons_completed} of ${c.lessons_total} lessons`} />
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Chosen {day(c.enrolled_at)}
                                {c.completed_at ? ` · finished ${day(c.completed_at)}` : ` · last touched ${ago(c.last_touch)}`}
                                {c.minutes > 0 ? ` · ${numberAU.format(hoursOf(c.minutes))} h` : ""}
                                {c.certified ? " · certificate earned" : ""}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
