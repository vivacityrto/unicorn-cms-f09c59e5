import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

function stripHtml(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").trim();
}

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function MyNotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const typeCounts: Record<string, number> = {};
  notifications.forEach((n) => {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  });

  const filtered = activeFilter
    ? notifications.filter((n) => n.type === activeFilter)
    : notifications;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">My Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} unread</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Type filter badges */}
      {Object.keys(typeCounts).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(typeCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <Badge
                key={type}
                variant={activeFilter === type ? "default" : "outline"}
                className="cursor-pointer text-xs select-none"
                onClick={() => setActiveFilter(activeFilter === type ? null : type)}
              >
                {formatType(type)}: {count}
              </Badge>
            ))}
          {activeFilter && (
            <Badge
              variant="secondary"
              className="cursor-pointer text-xs select-none"
              onClick={() => setActiveFilter(null)}
            >
              Clear
            </Badge>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading notifications…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {activeFilter ? "No notifications of this type" : "No notifications yet"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((n) => (
              <div
                key={n.id}
                className={`p-3 px-4 hover:bg-accent/50 transition-colors cursor-pointer ${
                  !n.is_read ? "bg-accent/20" : ""
                }`}
                onClick={() => {
                  if (!n.is_read) markAsRead(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-0.5 min-w-0">
                    {n.tenant_name && (
                      <p className="text-xs font-medium text-primary truncate">{n.tenant_name}</p>
                    )}
                    <p className="text-sm font-medium leading-tight">
                      {n.title || formatType(n.type)}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {stripHtml(n.message)}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {format(new Date(n.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-destructive flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
