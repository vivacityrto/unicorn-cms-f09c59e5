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

                  return (
                    <CalendarEventCard
                      key={event.id}
                      event={event}
                      style={{
                        position: 'absolute',
                        top: `${top}px`,
                        left: '2px',
                        right: '2px',
                        height: `${height}px`,
                      }}
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
