import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CheckSquare, Video, Bell, Calendar as CalIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfDay,
  isToday,
} from "date-fns";
import { useClientReminders, type ClientReminder } from "@/hooks/useClientReminders";
import { ReminderDetailDrawer } from "./ReminderDetailDrawer";

type ViewMode = "month" | "week" | "agenda";

const TYPE_ICONS: Record<string, typeof CheckSquare> = {
  task: CheckSquare,
  meeting: Video,
  reminder: Bell,
};

const TYPE_COLORS: Record<string, string> = {
  task: "bg-blue-500",
  meeting: "bg-purple-500",
  reminder: "bg-amber-500",
};

export function ClientRemindersCalendar() {
  const { reminders, isLoading, isClientAdmin } = useClientReminders();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedReminder, setSelectedReminder] = useState<ClientReminder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Group reminders by date key
  const remindersByDate = useMemo(() => {
    const map = new Map<string, ClientReminder[]>();
    for (const r of reminders) {
      const key = format(new Date(r.starts_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reminders]);

  // Navigation
  const navPrev = () => {
    setCurrentDate(viewMode === "month" ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  };
  const navNext = () => {
    setCurrentDate(viewMode === "month" ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  };
  const goToday = () => setCurrentDate(new Date());

  // Calendar grid days
  const calendarDays = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return eachDayOfInterval({
        start: startOfWeek(monthStart, { weekStartsOn: 1 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
      });
    }
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate, viewMode]);

  // Agenda items for current month/week
  const agendaItems = useMemo(() => {
    const start = viewMode === "month" ? startOfMonth(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = viewMode === "month" ? endOfMonth(currentDate) : endOfWeek(currentDate, { weekStartsOn: 1 });
    return reminders.filter((r) => {
      const d = new Date(r.starts_at);
      return d >= startOfDay(start) && d <= end;
    });
  }, [reminders, currentDate, viewMode]);

  const handleItemClick = (reminder: ClientReminder) => {
    setSelectedReminder(reminder);
    setDrawerOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {viewMode === "month"
              ? format(currentDate, "MMMM yyyy")
              : `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM yyyy")}`}
          </h2>
          <Button variant="outline" size="icon" onClick={navNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {(["month", "week", "agenda"] as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode(mode)}
              className="capitalize"
            >
              {mode}
            </Button>
          ))}
        </div>
      </div>

      {/* Scope indicator */}
      {isClientAdmin && (
        <p className="text-xs text-muted-foreground">
          Showing all reminders across your organisation
        </p>
      )}

      {/* Calendar grid (month/week) */}
      {viewMode !== "agenda" ? (
        <div className="border rounded-lg overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-muted/50">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-b">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayReminders = remindersByDate.get(key) || [];
              const inMonth = viewMode === "month" ? isSameMonth(day, currentDate) : true;

              return (
                <div
                  key={key}
                  className={`min-h-[80px] sm:min-h-[100px] border-b border-r p-1 ${
                    !inMonth ? "bg-muted/30" : ""
                  } ${isToday(day) ? "bg-primary/5" : ""}`}
                >
                  <p
                    className={`text-xs font-medium mb-1 ${
                      isToday(day)
                        ? "text-primary font-bold"
                        : !inMonth
                        ? "text-muted-foreground/50"
                        : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </p>
                  <div className="space-y-0.5">
                    {dayReminders.slice(0, 3).map((r) => {
                      const Icon = TYPE_ICONS[r.item_type] || Bell;
                      return (
                        <button
                          key={r.item_id}
                          onClick={() => handleItemClick(r)}
                          className="w-full flex items-center gap-1 px-1 py-0.5 rounded text-xs hover:bg-accent transition-colors text-left truncate"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${TYPE_COLORS[r.item_type] || "bg-muted"}`} />
                          <span className="truncate">{r.title}</span>
                        </button>
                      );
                    })}
                    {dayReminders.length > 3 && (
                      <p className="text-xs text-muted-foreground pl-1">
                        +{dayReminders.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda view */
        <div className="space-y-2">
          {agendaItems.length === 0 ? (
            <Card className="p-8 text-center">
              <CalIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No reminders for this period</p>
            </Card>
          ) : (
            agendaItems.map((r) => {
              const Icon = TYPE_ICONS[r.item_type] || Bell;
              return (
                <button
                  key={r.item_id}
                  onClick={() => handleItemClick(r)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${TYPE_COLORS[r.item_type]}/10`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.starts_at), "EEE d MMM, h:mm a")}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize text-xs">
                    {r.item_type}
                  </Badge>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Detail drawer */}
      <ReminderDetailDrawer
        reminder={selectedReminder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
