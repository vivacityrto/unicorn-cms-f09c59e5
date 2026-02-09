import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { isToday, isThisWeek, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useClientNotifications, type ClientNotification } from "@/hooks/useClientNotifications";
import { useNotificationPrefs, type CategoryPrefs } from "@/hooks/useNotificationPrefs";
import { Info } from "lucide-react";

type FilterType = "all" | "events" | "tasks" | "meetings" | "obligations";

const TYPE_TO_CATEGORY: Record<string, keyof CategoryPrefs> = {
  task_due: "tasks",
  meeting_upcoming: "meetings",
  obligation_due: "obligations",
  events: "events",
  event: "events",
};

function groupNotifications(notifications: ClientNotification[]) {
  const today: ClientNotification[] = [];
  const thisWeek: ClientNotification[] = [];
  const older: ClientNotification[] = [];

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (isToday(d)) today.push(n);
    else if (isThisWeek(d, { weekStartsOn: 1 })) thisWeek.push(n);
    else older.push(n);
  }

  return { today, thisWeek, older };
}

export default function ClientNotifications() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useClientNotifications();
  const { categories: prefs } = useNotificationPrefs();
  const [filter, setFilter] = useState<FilterType>("all");
  const navigate = useNavigate();

  const hasHiddenCategories = Object.values(prefs).some((v) => !v);

  const filtered = useMemo(() => {
    let items = notifications.filter((n) => {
      const cat = TYPE_TO_CATEGORY[n.type || ""];
      if (cat && !prefs[cat]) return false;
      return true;
    });
    if (filter !== "all") {
      items = items.filter((n) => n.type === filter || n.type?.toLowerCase() === filter);
    }
    return items;
  }, [notifications, filter, prefs]);

  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  const handleClick = (notification: ClientNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  const renderGroup = (title: string, items: ClientNotification[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent ${
              !n.is_read ? "bg-primary/5 border-primary/20" : ""
            }`}
          >
            <Bell className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium"} truncate`}>
                  {n.title}
                </p>
                {!n.is_read && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    New
                  </Badge>
                )}
              </div>
              {n.message && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(n.created_at), "d MMM yyyy, h:mm a")}
              </p>
            </div>
            {n.link && <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="obligations">Obligations</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Hidden prefs banner */}
      {hasHiddenCategories && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Some notification types are hidden based on your preferences.
        </div>
      )}

      {/* Grouped list */}
      <div className="space-y-6">
        {renderGroup("Today", groups.today)}
        {renderGroup("This Week", groups.thisWeek)}
        {renderGroup("Older", groups.older)}

        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No notifications to show</p>
          </Card>
        )}
      </div>
    </div>
  );
}
