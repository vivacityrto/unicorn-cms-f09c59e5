import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { CalendarOwnerSelector } from '@/components/calendar/CalendarOwnerSelector';
import { CalendarEventDetailDialog } from '@/components/calendar/CalendarEventDetailDialog';
import { LinkEventToClientDialog } from '@/components/calendar/LinkEventToClientDialog';
import { useWorkCalendar, CalendarEvent } from '@/hooks/useWorkCalendar';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkCalendar() {
  const { profile } = useAuth();
  const {
    view,
    setView,
    currentDate,
    dateRange,
    selectedOwnerId,
    setSelectedOwnerId,
    showClientLinkedOnly,
    setShowClientLinkedOnly,
    events,
    isLoading,
    sharedCalendars,
    goToPrevious,
    goToNext,
    goToToday,
    refetch,
    linkToClient,
    createTimeDraft,
  } = useWorkCalendar();

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [linkEventId, setLinkEventId] = useState<string | null>(null);

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleCreateTimeDraft = (eventId: string) => {
    createTimeDraft(eventId);
  };

  const handleLinkToClient = (eventId: string) => {
    setLinkEventId(eventId);
  };

  const handleConfirmLinkToClient = (clientId: number) => {
    if (linkEventId) {
      linkToClient({ eventId: linkEventId, clientId });
      setLinkEventId(null);
    }
  };

  // Format date range for header
  const getDateRangeLabel = () => {
    switch (view) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'week':
        return `${format(dateRange.start, 'MMM d')} - ${format(dateRange.end, 'MMM d, yyyy')}`;
      case 'month':
        return format(currentDate, 'MMMM yyyy');
    }
  };

  const currentUserName = profile 
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'My Calendar'
    : 'My Calendar';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            View and manage your calendar events
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Sync
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Calendar selector and navigation */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Calendar selector */}
              <CalendarOwnerSelector
                selectedOwnerId={selectedOwnerId}
                onSelectOwner={setSelectedOwnerId}
                sharedCalendars={sharedCalendars}
                currentUserName={currentUserName}
              />

              {/* Date navigation */}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={goToPrevious}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <Button variant="ghost" size="icon" onClick={goToNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Date range label */}
              <span className="text-sm font-medium text-foreground">
                {getDateRangeLabel()}
              </span>
            </div>

            {/* Right: View toggle and filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Client filter */}
              <Toggle
                pressed={showClientLinkedOnly}
                onPressedChange={setShowClientLinkedOnly}
                size="sm"
                className="gap-2"
              >
                <Building2 className="h-4 w-4" />
                Client linked only
              </Toggle>

              {/* View toggle */}
              <Tabs
                value={view}
                onValueChange={(v) => setView(v as any)}
              >
                <TabsList>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid */}
      <div className="h-[calc(100vh-280px)] min-h-[500px]">
        {isLoading ? (
          <Card className="h-full">
            <CardContent className="p-4 space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-full w-full" />
            </CardContent>
          </Card>
        ) : (
          <CalendarGrid
            view={view}
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onCreateTimeDraft={handleCreateTimeDraft}
            onLinkToClient={handleLinkToClient}
          />
        )}
      </div>

      {/* Event detail dialog */}
      {selectedEvent && (
        <CalendarEventDetailDialog
          event={selectedEvent}
          open={!!selectedEvent}
          onOpenChange={(open) => !open && setSelectedEvent(null)}
          onCreateTimeDraft={handleCreateTimeDraft}
          onLinkToClient={handleLinkToClient}
        />
      )}

      {/* Link to client dialog */}
      <LinkEventToClientDialog
        open={!!linkEventId}
        onOpenChange={(open) => !open && setLinkEventId(null)}
        onConfirm={handleConfirmLinkToClient}
      />
    </div>
  );
}
