import { Phone, CheckCircle2, Send, CheckSquare, History, type LucideIcon } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWorkType } from "@/components/client/package-dashboard/formatters";
import type { HomeFeedRow, HomeFeedEventType } from "@/hooks/use-client-home-feed";

interface Props {
  events: HomeFeedRow[];
  isLoading: boolean;
}

/** Each kind of event gets an icon tile, a short chip, and a colour that works in light and dark. */
const KIND: Record<HomeFeedEventType, { Icon: LucideIcon; chip: string; tile: string; accent: string }> = {
  task_due: { Icon: CheckSquare, chip: "Task due", tile: "bg-blue-500/15 text-blue-700 dark:text-blue-300", accent: "border-l-blue-500" },
  task_overdue: { Icon: CheckSquare, chip: "Overdue", tile: "bg-amber-500/15 text-amber-800 dark:text-amber-300", accent: "border-l-amber-500" },
  urgent_note: { Icon: CheckSquare, chip: "Urgent", tile: "bg-amber-500/15 text-amber-800 dark:text-amber-300", accent: "border-l-amber-500" },
  consult_logged: { Icon: Phone, chip: "Consult", tile: "bg-primary/15 text-primary", accent: "border-l-primary" },
  stage_completed: { Icon: CheckCircle2, chip: "Stage done", tile: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", accent: "border-l-emerald-500" },
  stage_released: { Icon: Send, chip: "Stage released", tile: "bg-violet-500/15 text-violet-700 dark:text-violet-300", accent: "border-l-violet-500" },
  task_completed: { Icon: CheckCircle2, chip: "Task done", tile: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", accent: "border-l-emerald-500" },
};

function renderTitle(event: HomeFeedRow): string {
  if (event.event_type === "consult_logged") return formatWorkType(event.title);
  return event.title;
}

function renderSubtitle(event: HomeFeedRow): string | null {
  if (event.event_type === "consult_logged") {
    if (event.subtitle) return formatWorkType(event.subtitle);
    return event.package_name ?? null;
  }
  return event.subtitle ?? null;
}

export function HomeRecentActivitySection({ events, isLoading }: Props) {
  if (!isLoading && events.length === 0) return null;

  return (
    <section aria-label="Recent activity" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-4 w-4 text-primary" aria-hidden />
          Recent activity
        </h2>
        {!isLoading && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{events.length} {events.length === 1 ? "update" : "updates"}</span>}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => {
            const { Icon, chip, tile, accent } = KIND[event.event_type];
            const subtitle = renderSubtitle(event);
            return (
              <li key={event.event_uid} className={`flex items-center gap-3 rounded-lg border border-l-4 bg-background p-3 transition-colors hover:border-primary/40 ${accent}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tile}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{renderTitle(event)}</p>
                  {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tile}`}>{chip}</span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(event.event_at), { addSuffix: true })}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
