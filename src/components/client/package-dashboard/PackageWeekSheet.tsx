import { addDays, format, parseISO } from "date-fns";
import { Clock3, FileText, ListChecks, MessagesSquare } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TOUCH_LABEL, hoursOf, weekOf, workTypeStyle, type PackageActivity } from "./packageActivity";

function Tile({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      </div>
    </div>
  );
}

/**
 * A mini page for one week of a package: hours by kind of work, and how often the team was in touch, tasks closed and
 * documents generated. Counts only: nothing here comes from internal notes beyond how many there were.
 */
export function PackageWeekSheet({ activity, week, highlightType, onOpenChange }: { activity: PackageActivity; week: string | null; highlightType?: string | null; onOpenChange: (open: boolean) => void }) {
  const rows = week ? activity.daily.filter((d) => weekOf(d.day) === week) : [];
  const byType = new Map<string, { minutes: number; entries: number }>();
  for (const d of rows) {
    const t = byType.get(d.work_type) ?? { minutes: 0, entries: 0 };
    t.minutes += d.minutes;
    t.entries += d.entries;
    byType.set(d.work_type, t);
  }
  const types = [...byType.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  const total = types.reduce((n, [, v]) => n + v.minutes, 0);
  const touches = week ? activity.touchpoints.filter((t) => t.week_start === week) : [];
  const tasks = week ? activity.tasks.find((t) => t.week_start === week) : undefined;
  const docs = week ? activity.documents.find((t) => t.week_start === week)?.count ?? 0 : 0;
  const touchTotal = touches.reduce((n, t) => n + t.count, 0);
  const days = week ? [...new Set(rows.map((d) => d.day))].length : 0;

  return (
    <Sheet open={!!week} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {week && (
          <>
            <SheetHeader>
              <SheetTitle>Week of {format(parseISO(week), "d MMMM yyyy")}</SheetTitle>
              <SheetDescription>{format(parseISO(week), "d MMM")} to {format(addDays(parseISO(week), 6), "d MMM")}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-5">
              <section aria-label="Week at a glance" className="grid grid-cols-2 gap-3">
                <Tile icon={Clock3} label="Hours" value={`${hoursOf(total)} h`} />
                <Tile icon={MessagesSquare} label="Touchpoints" value={String(touchTotal)} />
                <Tile icon={ListChecks} label="Tasks closed" value={String(tasks?.completed ?? 0)} />
                <Tile icon={FileText} label="Documents" value={String(docs)} />
              </section>

              <section aria-label="Hours by kind of work">
                <h3 className="mb-2 text-sm font-semibold">Where the hours went</h3>
                {types.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hours were logged this week.</p>
                ) : (
                  <ul className="space-y-3">
                    {types.map(([type, v]) => {
                      const st = workTypeStyle(type);
                      return (
                        <li key={type} className={cn("rounded-lg", highlightType === type && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background")}>
                          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                            <span className="flex items-center gap-2 font-medium"><span className={cn("h-2.5 w-2.5 rounded-sm", st.bg)} aria-hidden />{st.label}</span>
                            <span className="tabular-nums text-muted-foreground">{hoursOf(v.minutes)} h · {v.entries} {v.entries === 1 ? "entry" : "entries"}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${st.label}: ${hoursOf(v.minutes)} hours`}>
                            <div className={cn("h-full rounded-full", st.bg)} style={{ width: `${total ? (v.minutes / total) * 100 : 0}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {days > 0 && <p className="mt-2 text-xs text-muted-foreground">Work happened on {days} {days === 1 ? "day" : "days"} this week.</p>}
              </section>

              <section aria-label="Touchpoints">
                <h3 className="mb-2 text-sm font-semibold">How often you were in touch</h3>
                {touches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No emails, calls, meetings or follow-ups were recorded this week.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {touches.map((t) => (
                      <li key={t.kind} className="rounded-full border bg-card px-3 py-1 text-xs font-medium">{TOUCH_LABEL[t.kind]} · {t.count}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">These are counts only. What was said stays between you and your consultant.</p>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
