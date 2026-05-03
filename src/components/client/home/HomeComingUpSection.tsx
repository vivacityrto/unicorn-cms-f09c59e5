import { CheckSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import type { HomeFeedRow } from "@/hooks/use-client-home-feed";

interface Props {
  events: HomeFeedRow[];
  isLoading: boolean;
}

export function HomeComingUpSection({ events, isLoading }: Props) {
  if (!isLoading && events.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Coming up
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <Link
              key={event.event_uid}
              to={event.href}
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent/40 transition-colors"
            >
              <CheckSquare className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                {event.title}
              </p>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDistanceToNow(parseISO(event.event_at), { addSuffix: true })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
