import { Phone, CheckCircle2, Send, CheckSquare, type LucideIcon } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWorkType } from "@/components/client/package-dashboard/formatters";
import type { HomeFeedRow, HomeFeedEventType } from "@/hooks/use-client-home-feed";

interface Props {
  events: HomeFeedRow[];
  isLoading: boolean;
}

const ICON_MAP: Record<HomeFeedEventType, { Icon: LucideIcon; color: string }> = {
  task_due: { Icon: CheckSquare, color: "text-blue-600" },
  task_overdue: { Icon: CheckSquare, color: "text-amber-600" },
  urgent_note: { Icon: CheckSquare, color: "text-amber-600" },
  consult_logged: { Icon: Phone, color: "text-blue-600" },
  stage_completed: { Icon: CheckCircle2, color: "text-emerald-600" },
  stage_released: { Icon: Send, color: "text-violet-600" },
  task_completed: { Icon: CheckSquare, color: "text-emerald-600" },
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
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Recent activity
      </h2>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const { Icon, color } = ICON_MAP[event.event_type];
            const subtitle = renderSubtitle(event);
            return (
              <div key={event.event_uid} className="flex items-center gap-3">
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{renderTitle(event)}</p>
                  {subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(parseISO(event.event_at), { addSuffix: true })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
