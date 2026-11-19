import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Check, Copy, Sparkles, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Ring } from "@/components/client/home/Ring";
import { cn } from "@/lib/utils";
import type { ClientPackageStageRow } from "@/hooks/use-client-package-stages";
import { PackageWeekSheet } from "./PackageWeekSheet";
import { activityFacts, heatmap, hoursOf, mixByMonth, weekBins, weeklySnapshot, workTypeStyle, type PackageActivity, type Shape, type WeekBin } from "./packageActivity";

const CARD = "rounded-xl border bg-card p-4";
const TITLE = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function ShapeMark({ shape, className, size = 10 }: { shape: Shape; className?: string; size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" className={className} aria-hidden>
      {shape === "circle" && <circle cx="5" cy="5" r="4.5" />}
      {shape === "square" && <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" />}
      {shape === "diamond" && <polygon points="5,0 10,5 5,10 0,5" />}
      {shape === "triangle" && <polygon points="5,0.5 9.5,9.5 0.5,9.5" />}
    </svg>
  );
}

/** Where each kind of work is told apart by shape and colour together. */
function Legend({ types }: { types: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Kinds of work">
      {types.map((t) => {
        const st = workTypeStyle(t);
        return (
          <li key={t} className="inline-flex items-center gap-1.5">
            <ShapeMark shape={st.shape} className={st.fill} />
            {st.label}
          </li>
        );
      })}
    </ul>
  );
}

/** This week against last week, as sentences a person could forward, with how much of the plan is used. */
function SnapshotCard({ activity, percentUsed }: { activity: PackageActivity; percentUsed: number }) {
  const snap = useMemo(() => weeklySnapshot(activity), [activity]);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Weekly snapshot, week of ${format(parseISO(snap.weekStart), "d MMMM yyyy")}\n${snap.lines.join("\n")}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard can be blocked; the text is still on screen. */
    }
  };
  return (
    <section aria-label="Weekly snapshot" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <Ring value={percentUsed} label={`${Math.round(percentUsed)}% of the package hours used`} size={72}>{Math.round(percentUsed)}%</Ring>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Your week at a glance</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {snap.lines.map((l) => (
              <li key={l} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span>{l}</span></li>
            ))}
          </ul>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy summary"}
        </Button>
      </div>
    </section>
  );
}

const W = 800;
const H = 270;
const LEFT = 44;
const RIGHT = W - 16;
const TOP = 14;
const LINE_BOTTOM = 160;
const STRIP_Y = 196;

function Dot({ shape, cx, cy, r, className }: { shape: Shape; cx: number; cy: number; r: number; className: string }) {
  if (shape === "circle") return <circle cx={cx} cy={cy} r={r} className={className} />;
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={2} className={className} />;
  if (shape === "diamond") return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} className={className} />;
  return <polygon points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`} className={className} />;
}

/**
 * Hours over time as a rising line, with every week that had work shown as a dot underneath. A dot's shape and colour
 * say the main kind of work that week and its size says how many entries. Finished stages are flags and today is a rule.
 */
function ActivityTimeline({ activity, stages, hoursTotal, onOpenWeek }: { activity: PackageActivity; stages: ClientPackageStageRow[]; hoursTotal: number; onOpenWeek: (w: string) => void }) {
  const bins = useMemo(() => weekBins(activity.daily), [activity.daily]);
  const facts = useMemo(() => activityFacts(activity), [activity]);
  const [asTable, setAsTable] = useState(false);
  if (bins.length === 0) return null;

  const milestones = stages.filter((s) => s.completion_date).map((s) => ({ date: s.completion_date as string, name: s.stage_shortname || s.stage_name }));
  const today = new Date();
  const startDate = parseISO(activity.window?.start ?? bins[0].week);
  const firstBin = parseISO(bins[0].week);
  const from = firstBin < startDate ? firstBin : startDate;
  const endWindow = parseISO(activity.window?.end ?? bins[bins.length - 1].week);
  const lastBin = addDays(parseISO(bins[bins.length - 1].week), 7);
  const to = [endWindow, lastBin, today].reduce((a, b) => (b > a ? b : a));
  const span = Math.max(1, differenceInCalendarDays(to, from));
  const x = (d: Date) => LEFT + (differenceInCalendarDays(d, from) / span) * (RIGHT - LEFT);
  const maxY = Math.max(hoursTotal, bins[bins.length - 1].cumulativeHours, 1);
  const y = (h: number) => LINE_BOTTOM - (h / maxY) * (LINE_BOTTOM - TOP);

  const path = bins.map((b, i) => `${i === 0 ? "M" : "L"}${x(addDays(parseISO(b.week), 3)).toFixed(1)},${y(b.cumulativeHours).toFixed(1)}`).join(" ");
  const area = `${path} L${x(addDays(parseISO(bins[bins.length - 1].week), 3)).toFixed(1)},${LINE_BOTTOM} L${x(addDays(parseISO(bins[0].week), 3)).toFixed(1)},${LINE_BOTTOM} Z`;
  const typesPresent = [...new Set(bins.map((b) => b.dominant))];
  const tickCount = Math.min(6, Math.floor(span / 28) + 1);
  const ticks = Array.from({ length: tickCount }, (_, i) => addDays(from, Math.round((span / Math.max(1, tickCount - 1)) * i)));
  const maxEntries = Math.max(1, ...bins.map((b) => b.entries));
  const radius = (b: WeekBin) => 4 + Math.sqrt(b.entries / maxEntries) * 6;
  const summary = `Hours used over time, rising to ${bins[bins.length - 1].cumulativeHours} hours across ${bins.length} active weeks.`;

  return (
    <section aria-label="Activity timeline" className={CARD}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className={TITLE}>Activity timeline</h3>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          <Table2 className="h-3.5 w-3.5" aria-hidden />
          {asTable ? "View as chart" : "View as table"}
        </Button>
      </div>
      <p className="mb-3 text-sm text-foreground">{facts.sentence}</p>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">Week of</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Entries</th><th className="px-3 py-2">Main work</th><th className="px-3 py-2">Running total</th></tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.week} className="border-t">
                  <td className="px-3 py-2"><button type="button" className="text-primary hover:underline" onClick={() => onOpenWeek(b.week)}>{format(parseISO(b.week), "d MMM yyyy")}</button></td>
                  <td className="px-3 py-2 tabular-nums">{hoursOf(b.minutes)}</td>
                  <td className="px-3 py-2 tabular-nums">{b.entries}</td>
                  <td className="px-3 py-2">{workTypeStyle(b.dominant).label}</td>
                  <td className="px-3 py-2 tabular-nums">{b.cumulativeHours} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="group" aria-label={summary}>
            <title>{summary}</title>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={LEFT} x2={RIGHT} y1={y(maxY * f)} y2={y(maxY * f)} className="stroke-border" strokeDasharray={f === 0 ? undefined : "3 4"} />
                <text x={LEFT - 6} y={y(maxY * f) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{Math.round(maxY * f)}</text>
              </g>
            ))}
            {hoursTotal > 0 && <text x={RIGHT} y={y(hoursTotal) - 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{hoursTotal} hours included</text>}
            <path d={area} className="fill-primary/10" />
            <path d={path} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" />
            {milestones.map((m) => {
              const mx = x(parseISO(m.date));
              return (
                <g key={`${m.date}-${m.name}`}>
                  <line x1={mx} x2={mx} y1={TOP} y2={STRIP_Y + 18} className="stroke-emerald-500/60" strokeDasharray="2 3" />
                  <polygon points={`${mx},${TOP} ${mx + 7},${TOP + 4} ${mx},${TOP + 8}`} className="fill-emerald-500" />
                  <title>{`${m.name} finished ${format(parseISO(m.date), "d MMM yyyy")}`}</title>
                </g>
              );
            })}
            <line x1={x(today)} x2={x(today)} y1={TOP} y2={STRIP_Y + 18} className="stroke-pink-500" strokeDasharray="4 3" />
            <text x={x(today)} y={H - 6} textAnchor="middle" className="fill-pink-600 text-[11px] font-medium dark:fill-pink-400">Today</text>
            <line x1={LEFT} x2={RIGHT} y1={STRIP_Y + 18} y2={STRIP_Y + 18} className="stroke-border" />
            {bins.map((b) => {
              const st = workTypeStyle(b.dominant);
              const cx = x(addDays(parseISO(b.week), 3));
              const label = `Week of ${format(parseISO(b.week), "d MMM")}: ${hoursOf(b.minutes)} hours in ${b.entries} ${b.entries === 1 ? "entry" : "entries"}, mostly ${st.label.toLowerCase()}`;
              return (
                <g key={b.week} role="button" tabIndex={0} aria-label={label} className="cursor-pointer outline-none focus-visible:[&>*]:stroke-foreground" onClick={() => onOpenWeek(b.week)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenWeek(b.week); } }}>
                  <title>{label}</title>
                  <Dot shape={st.shape} cx={cx} cy={STRIP_Y} r={radius(b)} className={cn(st.fill, "opacity-90 hover:opacity-100")} />
                </g>
              );
            })}
            {ticks.map((t) => (
              <text key={t.toISOString()} x={x(t)} y={STRIP_Y + 36} textAnchor="middle" className="fill-muted-foreground text-[11px]">{format(t, "MMM yyyy")}</text>
            ))}
          </svg>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Legend types={typesPresent} />
        <span className="text-xs text-muted-foreground">Dot size is the number of entries. Green flags are finished stages. Select a dot to open that week.</span>
      </div>
    </section>
  );
}

/** Hours by week and kind of work. Darker means more hours; every cell opens that week. */
function HoursHeatmap({ activity, onOpenWeek }: { activity: PackageActivity; onOpenWeek: (w: string, type: string) => void }) {
  const h = useMemo(() => heatmap(activity.daily), [activity.daily]);
  if (h.weeks.length === 0) return null;
  const busiest = (() => {
    let best = { type: "", week: "", minutes: 0 };
    h.types.forEach((t, i) => h.minutes[i].forEach((m, j) => { if (m > best.minutes) best = { type: t, week: h.weeks[j], minutes: m }; }));
    return best;
  })();
  return (
    <section aria-label="Hours by week and kind of work" className={CARD}>
      <h3 className={TITLE}>Hours by week</h3>
      <p className="mb-3 mt-1 text-sm text-foreground">
        {busiest.minutes > 0 ? `The most focused week was ${format(parseISO(busiest.week), "d MMM yyyy")}: ${hoursOf(busiest.minutes)} hours of ${workTypeStyle(busiest.type).label.toLowerCase()}.` : "No hours yet."}
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-max">
          {h.types.map((t, i) => {
            const st = workTypeStyle(t);
            return (
              <div key={t} className="flex items-center gap-1 py-0.5">
                <div className="flex w-32 shrink-0 items-center gap-1.5 pr-2 text-xs"><ShapeMark shape={st.shape} className={st.fill} /><span className="truncate" title={st.label}>{st.label}</span></div>
                {h.weeks.map((w, j) => {
                  const m = h.minutes[i][j];
                  const alpha = m === 0 ? 0 : 0.18 + 0.82 * (m / h.maxMinutes);
                  return (
                    <button
                      key={w}
                      type="button"
                      disabled={m === 0}
                      onClick={() => onOpenWeek(w, t)}
                      aria-label={`${st.label}, week of ${format(parseISO(w), "d MMM")}: ${hoursOf(m)} hours`}
                      title={`${st.label}, week of ${format(parseISO(w), "d MMM")}: ${hoursOf(m)} h`}
                      className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", m === 0 ? "bg-muted/60" : "text-primary-foreground hover:ring-2 hover:ring-primary/40")}
                      style={m === 0 ? undefined : { backgroundColor: `hsl(var(--primary) / ${alpha})` }}
                    >
                      {m >= 30 ? Math.round(m / 60 * 10) / 10 : ""}
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="flex gap-1 pl-32 pt-1 text-[10px] text-muted-foreground" aria-hidden>
            {h.weeks.map((w, j) => (
              <div key={w} className="w-6 shrink-0 text-center">{j % 4 === 0 ? format(parseISO(w), "d MMM").split(" ")[0] + " " + format(parseISO(w), "MMM").slice(0, 1) : ""}</div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Each square is a week. Numbers are hours once a week reaches half an hour. Select a square to open that week.</p>
    </section>
  );
}

/** Each month's hours as shares of the kinds of work, so a shift in how the time is used shows up. */
function MixOverTime({ activity }: { activity: PackageActivity }) {
  const months = useMemo(() => mixByMonth(activity.daily), [activity.daily]);
  if (months.length < 2) return null;
  const first = months[0];
  const last = months[months.length - 1];
  const top = (m: (typeof months)[number]) => [...m.shares].sort((a, b) => b.percent - a.percent)[0];
  const a = top(first);
  const b = top(last);
  const sentence = a.type === b.type
    ? `${workTypeStyle(b.type).label} has been the main use of time in both the first and the latest month.`
    : `${workTypeStyle(a.type).label} led in ${format(parseISO(`${first.month}-01`), "MMMM")}; ${workTypeStyle(b.type).label} leads in ${format(parseISO(`${last.month}-01`), "MMMM")}.`;
  const types = [...new Set(months.flatMap((m) => m.shares.map((s) => s.type)))];
  return (
    <section aria-label="Mix of work by month" className={CARD}>
      <h3 className={TITLE}>How the mix of work changed</h3>
      <p className="mb-3 mt-1 text-sm text-foreground">{sentence}</p>
      <ul className="space-y-2">
        {months.map((m) => (
          <li key={m.month} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{format(parseISO(`${m.month}-01`), "MMM yyyy")}</span>
            <div className="flex h-5 overflow-hidden rounded-md bg-muted" role="img" aria-label={`${format(parseISO(`${m.month}-01`), "MMMM yyyy")}: ${m.shares.map((s) => `${workTypeStyle(s.type).label} ${s.percent}%`).join(", ")}`}>
              {m.shares.map((s) => (
                <div key={s.type} className={cn("flex items-center justify-center text-[10px] font-medium text-white", workTypeStyle(s.type).bg)} style={{ width: `${s.percent}%` }} title={`${workTypeStyle(s.type).label}: ${s.percent}%`}>
                  {s.percent >= 14 ? `${s.percent}%` : ""}
                </div>
              ))}
            </div>
            <span className="text-right tabular-nums text-muted-foreground">{hoursOf(m.totalMinutes)} h</span>
          </li>
        ))}
      </ul>
      <div className="mt-3"><Legend types={types} /></div>
    </section>
  );
}

/**
 * The package's analytics section: a weekly snapshot, an activity timeline, hours by week and the mix of work by
 * month, all from the aggregated activity function. Each part that points at a week opens a mini page for it.
 */
export function PackageAnalytics({
  activity,
  isLoading,
  isError,
  stages,
  hoursTotal,
  percentUsed,
}: {
  activity: PackageActivity | undefined;
  isLoading: boolean;
  isError: boolean;
  stages: ClientPackageStageRow[];
  hoursTotal: number;
  percentUsed: number;
}) {
  const [open, setOpen] = useState<{ week: string; type: string | null } | null>(null);
  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (isError || !activity) {
    return <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Couldn't load the activity analytics for this package. Refresh to try again.</div>;
  }
  if (activity.daily.length === 0) {
    return (
      <section aria-label="Package analytics" className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm font-medium">No hours logged yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Your timeline, weekly snapshot and hours by week will appear here once your consultant logs time.</p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <SnapshotCard activity={activity} percentUsed={percentUsed} />
      <ActivityTimeline activity={activity} stages={stages} hoursTotal={hoursTotal} onOpenWeek={(w) => setOpen({ week: w, type: null })} />
      <div className="grid gap-4 xl:grid-cols-2">
        <HoursHeatmap activity={activity} onOpenWeek={(w, t) => setOpen({ week: w, type: t })} />
        <MixOverTime activity={activity} />
      </div>
      <PackageWeekSheet activity={activity} week={open?.week ?? null} highlightType={open?.type} onOpenChange={(o) => { if (!o) setOpen(null); }} />
    </div>
  );
}
