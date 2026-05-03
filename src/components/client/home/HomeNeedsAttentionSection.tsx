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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 mb-2">
        Needs attention
      </h2>
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-2 divide-y divide-amber-100">
          {events.map((event) => (
            <Link
              key={event.event_uid}
              to={event.href}
              className="flex items-center gap-3 p-3 hover:bg-amber-100/40 rounded-sm transition-colors"
            >
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {event.title}
                </p>
                {event.subtitle && (
                  <p className="text-xs text-muted-foreground">{event.subtitle}</p>
                )}
              </div>
              <span className="text-xs text-amber-700 shrink-0">
                Due {formatDistanceToNow(parseISO(event.event_at), { addSuffix: true })}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
