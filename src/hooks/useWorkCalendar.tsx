import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from 'date-fns';
import { toast } from 'sonner';

export type CalendarView = 'day' | 'week' | 'month';

export interface CalendarEvent {
  id: string;
  owner_user_uuid: string;
  start_at: string;
  end_at: string;
  title: string;
  description: string | null;
  location: string | null;
  attendees: { list: any[]; emails: string[] } | null;
  client_id: number | null;
  package_id: number | null;
  status: string | null;
  access_scope: 'owner' | 'busy_only' | 'details';
  meeting_url: string | null;
  sensitivity: string | null;
  provider: string;
}

interface SharedCalendarOwner {
  user_uuid: string;
  full_name: string;
  scope: 'busy_only' | 'details';
}

export function useWorkCalendar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null); // null = my calendar
  const [showClientLinkedOnly, setShowClientLinkedOnly] = useState(false);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    switch (view) {
      case 'day':
        return {
          start: startOfDay(currentDate),
          end: endOfDay(currentDate),
        };
      case 'week':
        return {
          start: startOfWeek(currentDate, { weekStartsOn: 1 }),
          end: endOfWeek(currentDate, { weekStartsOn: 1 }),
        };
      case 'month':
        return {
          start: startOfMonth(currentDate),
          end: endOfMonth(currentDate),
        };
    }
  }, [view, currentDate]);

  // Fetch calendars shared with the current user
  const { data: sharedCalendars = [] } = useQuery({
    queryKey: ['calendar-shares-received', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('calendar_shares')
        .select(`
          id,
          owner_user_uuid,
          scope,
          users!calendar_shares_owner_user_uuid_fkey (
            first_name,
            last_name
          )
        `)
        .eq('viewer_user_uuid', user.id);
      
      if (error) throw error;
      
      return (data || []).map((share: any) => ({
        user_uuid: share.owner_user_uuid,
        full_name: `${share.users?.first_name || ''} ${share.users?.last_name || ''}`.trim() || 'Unknown User',
        scope: share.scope as 'busy_only' | 'details',
      })) as SharedCalendarOwner[];
    },
    enabled: !!user?.id,
  });

  // Determine which user's calendar we're viewing
  const viewingUserId = selectedOwnerId || user?.id;

  // Fetch calendar events
  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ['calendar-events-shared', viewingUserId, dateRange.start, dateRange.end, showClientLinkedOnly],
    queryFn: async () => {
      if (!viewingUserId) return [];

      // Query the secure view
      let query = supabase
        .from('calendar_events_shared')
        .select('*')
        .eq('owner_user_uuid', viewingUserId)
        .gte('start_at', dateRange.start.toISOString())
        .lte('start_at', dateRange.end.toISOString())
        .order('start_at', { ascending: true });

      if (showClientLinkedOnly) {
        query = query.not('client_id', 'is', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      return (data || []).map((event: any) => ({
        id: event.id,
        owner_user_uuid: event.owner_user_uuid,
        start_at: event.start_at,
        end_at: event.end_at,
        title: event.title || 'Untitled',
        description: event.description,
        location: event.location,
        attendees: event.attendees,
        client_id: event.client_id,
        package_id: event.package_id,
        status: event.status,
        access_scope: event.access_scope,
        meeting_url: event.meeting_url,
        sensitivity: event.sensitivity,
        provider: event.provider,
      })) as CalendarEvent[];
    },
    enabled: !!viewingUserId,
  });

  // Navigation functions
  const goToPrevious = useCallback(() => {
    switch (view) {
      case 'day':
        setCurrentDate(subDays(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case 'month':
        setCurrentDate(subMonths(currentDate, 1));
        break;
    }
  }, [view, currentDate]);

  const goToNext = useCallback(() => {
    switch (view) {
      case 'day':
        setCurrentDate(addDays(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case 'month':
        setCurrentDate(addMonths(currentDate, 1));
        break;
    }
  }, [view, currentDate]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Link event to client
  const linkToClientMutation = useMutation({
    mutationFn: async ({ eventId, clientId }: { eventId: string; clientId: number }) => {
      const { error } = await supabase
        .from('calendar_events')
        .update({ client_id: clientId })
        .eq('id', eventId)
        .eq('user_id', user?.id); // Only owner can link

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Event linked to client');
      queryClient.invalidateQueries({ queryKey: ['calendar-events-shared'] });
    },
    onError: (error) => {
      console.error('Failed to link event:', error);
      toast.error('Failed to link event to client');
    },
  });

  // Create time draft from event
  const createTimeDraftMutation = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      // First get the event details
      const { data: event, error: fetchError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError) throw fetchError;
      if (!event) throw new Error('Event not found');

      const durationMinutes = Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000);

      // Create a time draft
      const { error } = await supabase
        .from('calendar_time_drafts')
        .insert({
          created_by: user.id,
          calendar_event_id: eventId,
          client_id: event.client_id,
          package_id: event.package_id,
          notes: event.title,
          work_date: event.start_at.split('T')[0],
          minutes: durationMinutes,
          status: 'draft',
          tenant_id: event.tenant_id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Time draft created');
    },
    onError: (error) => {
      console.error('Failed to create time draft:', error);
      toast.error('Failed to create time draft');
    },
  });

  return {
    // State
    view,
    setView,
    currentDate,
    setCurrentDate,
    dateRange,
    selectedOwnerId,
    setSelectedOwnerId,
    showClientLinkedOnly,
    setShowClientLinkedOnly,
    
    // Data
    events,
    isLoading,
    sharedCalendars,
    viewingUserId,
    
    // Actions
    goToPrevious,
    goToNext,
    goToToday,
    refetch,
    linkToClient: linkToClientMutation.mutate,
    createTimeDraft: createTimeDraftMutation.mutate,
    isLinkingToClient: linkToClientMutation.isPending,
    isCreatingTimeDraft: createTimeDraftMutation.isPending,
  };
}
