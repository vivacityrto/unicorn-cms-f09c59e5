import { useMemo } from 'react';
import { format, isSameDay, isToday, eachDayOfInterval, eachHourOfInterval, startOfDay, endOfDay, startOfWeek, endOfWeek, getHours, getMinutes, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarEvent, CalendarView } from '@/hooks/useWorkCalendar';
import { CalendarEventCard } from './CalendarEventCard';

interface CalendarGridProps {
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onCreateTimeDraft?: (eventId: string) => void;
  onLinkToClient?: (eventId: string) => void;
}

const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 6; // 6 AM
const END_HOUR = 22; // 10 PM

export function CalendarGrid({
  view,
  currentDate,
  events,
  onEventClick,
  onCreateTimeDraft,
  onLinkToClient,
}: CalendarGridProps) {
  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: new Date(dayStart.setHours(START_HOUR)),
      end: new Date(dayStart.setHours(END_HOUR - 1)),
    });
  }, [currentDate]);

  const days = useMemo(() => {
    if (view === 'day') {
      return [currentDate];
    }
    if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }
    // Month view - show weeks
    return [];
  }, [view, currentDate]);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
      const dayKey = format(new Date(event.start_at), 'yyyy-MM-dd');
      if (!grouped[dayKey]) {
        grouped[dayKey] = [];
      }
      grouped[dayKey].push(event);
    });
    return grouped;
  }, [events]);

  // Per-event layout: column index + cluster total columns (greedy packing)
  const eventLayouts = useMemo(() => {
    const map = new Map<string, { column: number; totalColumns: number }>();
    Object.values(eventsByDay).forEach((dayEvents) => {
      const sorted = [...dayEvents].sort((a, b) => {
        const sa = new Date(a.start_at).getTime();
        const sb = new Date(b.start_at).getTime();
        if (sa !== sb) return sa - sb;
        return new Date(b.end_at).getTime() - new Date(a.end_at).getTime();
      });

      const columnsEndTimes: number[] = [];
      const assignments: { id: string; column: number; start: number; end: number }[] = [];

      sorted.forEach((ev) => {
        const start = new Date(ev.start_at).getTime();
        const end = new Date(ev.end_at).getTime();
        let col = columnsEndTimes.findIndex((endT) => endT <= start);
        if (col === -1) {
          col = columnsEndTimes.length;
          columnsEndTimes.push(end);
        } else {
          columnsEndTimes[col] = end;
        }
        assignments.push({ id: ev.id, column: col, start, end });
      });

      // Build overlap clusters (strict overlap) so members share totalColumns
      const n = assignments.length;
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const union = (a: number, b: number) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      };
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = assignments[i], b = assignments[j];
          if (a.start < b.end && a.end > b.start) union(i, j);
        }
      }
      const clusterMaxCol = new Map<number, number>();
      assignments.forEach((a, i) => {
        const root = find(i);
        clusterMaxCol.set(root, Math.max(clusterMaxCol.get(root) ?? 0, a.column));
      });
      assignments.forEach((a, i) => {
        const root = find(i);
        const totalColumns = (clusterMaxCol.get(root) ?? 0) + 1;
        map.set(a.id, { column: a.column, totalColumns });
      });
    });
    return map;
  }, [eventsByDay]);

  // Month view
  if (view === 'month') {
    return <MonthView currentDate={currentDate} events={events} onEventClick={onEventClick} onCreateTimeDraft={onCreateTimeDraft} onLinkToClient={onLinkToClient} />;
  }

  // Day/Week view
  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border bg-card">
      {/* Header row with days */}
      <div className="flex border-b bg-muted/30">
        {/* Time gutter */}
        <div className="w-16 flex-shrink-0 border-r" />
        
        {/* Day headers */}
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'flex-1 text-center py-3 border-r last:border-r-0',
              isToday(day) && 'bg-primary/5'
            )}
          >
            <div className="text-xs text-muted-foreground uppercase">
              {format(day, 'EEE')}
            </div>
            <div
              className={cn(
                'text-lg font-semibold mt-1',
                isToday(day) && 'text-primary'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex relative">
          {/* Time gutter */}
          <div className="w-16 flex-shrink-0 border-r">
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="h-[60px] border-b text-xs text-muted-foreground pr-2 text-right pt-1"
              >
                {format(hour, 'h a')}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay[dayKey] || [];

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 relative border-r last:border-r-0',
                  isToday(day) && 'bg-primary/5'
                )}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div
                    key={hour.toISOString()}
                    className="h-[60px] border-b border-dashed border-border/50"
                  />
                ))}

                {/* Events */}
                {dayEvents.map((event) => {
                  const eventStart = new Date(event.start_at);
                  const eventEnd = new Date(event.end_at);
                  const startHour = getHours(eventStart) + getMinutes(eventStart) / 60;
                  const durationMinutes = differenceInMinutes(eventEnd, eventStart);
                  const top = (startHour - START_HOUR) * HOUR_HEIGHT;
                  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 24);

                  // Only show events within visible hours
                  if (startHour < START_HOUR || startHour >= END_HOUR) return null;

                  const layout = eventLayouts.get(event.id) ?? { column: 0, totalColumns: 1 };
                  const { column, totalColumns } = layout;

                  const palette = [
                    { backgroundColor: '#7130A0', color: '#ffffff' },
                    { backgroundColor: '#ED1878', color: '#ffffff' },
                    { backgroundColor: '#23C0DD', color: '#1a1a1a' },
                    { backgroundColor: '#44235F', color: '#ffffff' },
                  ];

                  const style: React.CSSProperties = {
                    position: 'absolute',
                    top: `${top}px`,
                    height: `${height}px`,
                  };

                  if (totalColumns === 1) {
                    style.left = '2px';
                    style.right = '2px';
                  } else {
                    style.left = `calc(${(column / totalColumns) * 100}% + 2px)`;
                    style.width = `calc(${(1 / totalColumns) * 100}% - 4px)`;
                    if (event.access_scope !== 'busy_only') {
                      const c = palette[column % palette.length];
                      style.backgroundColor = c.backgroundColor;
                      style.color = c.color;
                    }
                  }

                  return (
                    <CalendarEventCard
                      key={event.id}
                      event={event}
                      style={style}
                      onClick={() => onEventClick?.(event)}
                      onCreateTimeDraft={onCreateTimeDraft}
                      onLinkToClient={onLinkToClient}
                      compact={height < 50}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Month View Component
function MonthView({
  currentDate,
  events,
  onEventClick,
  onCreateTimeDraft,
  onLinkToClient,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onCreateTimeDraft?: (eventId: string) => void;
  onLinkToClient?: (eventId: string) => void;
}) {
  const weeks = useMemo(() => {
    const monthStart = startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }, [currentDate]);

  const eventsByDay = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
      const dayKey = format(new Date(event.start_at), 'yyyy-MM-dd');
      if (!grouped[dayKey]) {
        grouped[dayKey] = [];
      }
      grouped[dayKey].push(event);
    });
    return grouped;
  }, [events]);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="text-center py-2 text-xs font-medium text-muted-foreground uppercase border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1 overflow-y-auto">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0 min-h-[100px]">
            {week.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay[dayKey] || [];
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-r last:border-r-0 p-1 min-h-[100px]',
                    !isCurrentMonth && 'bg-muted/20 text-muted-foreground',
                    isToday(day) && 'bg-primary/5'
                  )}
                >
                  <div
                    className={cn(
                      'text-sm font-medium mb-1',
                      isToday(day) && 'text-primary'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          'text-xs px-1 py-0.5 rounded truncate cursor-pointer',
                          event.access_scope === 'busy_only'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        )}
                        onClick={() => onEventClick?.(event)}
                        title={event.title}
                      >
                        {format(new Date(event.start_at), 'HH:mm')} {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
