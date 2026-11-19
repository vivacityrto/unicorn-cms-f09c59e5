import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import type { HomeFeedRow } from "@/hooks/use-client-home-feed";

interface Props {
  events: HomeFeedRow[];
}

export function HomeNeedsAttentionSection({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
        Needs attention
      </h2>
      <Card className="border-amber-500/30 bg-amber-500/10">
        <CardContent className="p-2 divide-y divide-amber-500/20">
          {events.map((event) => (
            <Link
              key={event.event_uid}
              to={event.href}
              className="flex items-start gap-3 p-3 hover:bg-amber-500/10 rounded-sm transition-colors"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground line-clamp-2">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {event.subtitle ? `${event.subtitle} · ` : ""}
                  <span className="text-amber-700 dark:text-amber-400">Due {formatDistanceToNow(parseISO(event.event_at), { addSuffix: true })}</span>
                </p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
