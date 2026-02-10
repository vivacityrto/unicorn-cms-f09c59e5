import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { startOfDay, endOfDay, subDays, addDays } from 'date-fns';
import { toast } from 'sonner';

export interface Meeting {
  id: string;
  tenant_id: number;
  owner_user_uuid: string;
  client_id: number | null;
  package_id: number | null;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  location: string | null;
  is_online: boolean;
  is_organizer: boolean;
  status: 'scheduled' | 'completed' | 'cancelled';
  external_meeting_url: string | null;
  provider: string;
  needs_linking: boolean;
  time_draft_created: boolean;
  access_scope: 'owner' | 'busy_only' | 'details' | 'none';
  created_at: string;
  updated_at: string;
  // Microsoft artifact sync fields
  ms_ical_uid?: string | null;
  ms_join_url?: string | null;
  ms_organizer_email?: string | null;
  ms_last_synced_at?: string | null;
  ms_sync_status?: string | null;
  ms_sync_error?: string | null;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  participant_email: string;
  participant_name: string | null;
  participant_type: 'required' | 'optional' | 'organizer';
  attended: boolean | null;
  created_at: string;
}

export interface MeetingNote {
  id: string;
  meeting_id: string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingActionItem {
  id: string;
  meeting_id: string;
  task_id: string | null;
  description: string;
  assigned_to: string | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type MeetingFilter = 'all' | 'needs_linking' | 'no_time_draft' | 'this_week' | 'completed';

export function useMeetings() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [filter, setFilter] = useState<MeetingFilter>('all');
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 14),
    end: addDays(new Date(), 90),
  });

  // Fetch meetings from secure view
  const { data: meetings = [], isLoading, refetch } = useQuery({
    queryKey: ['meetings', user?.id, dateRange.start, dateRange.end, filter],
    queryFn: async () => {
      if (!user?.id) return [];

      let query = supabase
        .from('meetings_shared')
        .select('*')
        .gte('starts_at', dateRange.start.toISOString())
        .lte('starts_at', dateRange.end.toISOString())
        .order('starts_at', { ascending: false });

      // Apply filters
      if (filter === 'needs_linking') {
        query = query.eq('needs_linking', true);
      } else if (filter === 'no_time_draft') {
        query = query.eq('time_draft_created', false).eq('status', 'completed');
      } else if (filter === 'completed') {
        query = query.eq('status', 'completed');
      } else if (filter === 'this_week') {
        const weekStart = startOfDay(new Date());
        const weekEnd = endOfDay(addDays(weekStart, 7));
        query = query
          .gte('starts_at', weekStart.toISOString())
          .lte('starts_at', weekEnd.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Meeting[];
    },
    enabled: !!user?.id,
  });

  // Fetch participants for a meeting
  const fetchParticipants = useCallback(async (meetingId: string) => {
    const { data, error } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('participant_type', { ascending: true });

    if (error) throw error;
    return (data || []) as MeetingParticipant[];
  }, []);

  // Fetch notes for a meeting
  const fetchNotes = useCallback(async (meetingId: string) => {
    const { data, error } = await supabase
      .from('meeting_notes')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as MeetingNote[];
  }, []);

  // Fetch action items for a meeting
  const fetchActionItems = useCallback(async (meetingId: string) => {
    const { data, error } = await supabase
      .from('meeting_action_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as MeetingActionItem[];
  }, []);

  // Link meeting to client
  const linkToClientMutation = useMutation({
    mutationFn: async ({ meetingId, clientId, packageId }: { 
      meetingId: string; 
      clientId: number; 
      packageId?: number | null 
    }) => {
      const { error } = await supabase
        .from('meetings')
        .update({ 
          client_id: clientId, 
          package_id: packageId || null,
          needs_linking: false 
        })
        .eq('id', meetingId)
        .eq('owner_user_uuid', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Meeting linked to client');
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (error) => {
      console.error('Failed to link meeting:', error);
      toast.error('Failed to link meeting to client');
    },
  });

  // Create time draft from meeting
  const createTimeDraftMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      if (!user?.id || !profile?.tenant_id) throw new Error('Not authenticated');

      // Get meeting details
      const { data: meeting, error: fetchError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();

      if (fetchError) throw fetchError;
      if (!meeting) throw new Error('Meeting not found');

      const durationMinutes = Math.round(
        (new Date(meeting.ends_at).getTime() - new Date(meeting.starts_at).getTime()) / 60000
      );

      // Create time draft in calendar_time_drafts
      // We need to find the corresponding calendar event for this meeting
      const { data: calendarEvent } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('provider_event_id', meeting.external_event_id)
        .eq('user_id', user.id)
        .single();

      if (calendarEvent) {
        const { error: insertError } = await supabase
          .from('calendar_time_drafts')
          .insert([{
            calendar_event_id: calendarEvent.id,
            created_by: user.id,
            client_id: meeting.client_id,
            package_id: meeting.package_id,
            notes: meeting.title,
            work_date: meeting.starts_at.split('T')[0],
            minutes: durationMinutes,
            status: 'draft',
            tenant_id: profile.tenant_id,
          }]);

        if (insertError) {
          console.error('Failed to create time draft:', insertError);
        }
      }

      // Mark meeting as having time draft created
      const { error: updateError } = await supabase
        .from('meetings')
        .update({ time_draft_created: true })
        .eq('id', meetingId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success('Time draft created');
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (error) => {
      console.error('Failed to create time draft:', error);
      toast.error('Failed to create time draft');
    },
  });

  // Add note to meeting
  const addNoteMutation = useMutation({
    mutationFn: async ({ meetingId, notes }: { meetingId: string; notes: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('meeting_notes')
        .insert({
          meeting_id: meetingId,
          notes,
          created_by: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Note added');
    },
    onError: (error) => {
      console.error('Failed to add note:', error);
      toast.error('Failed to add note');
    },
  });

  // Update note
  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, notes }: { noteId: string; notes: string }) => {
      const { error } = await supabase
        .from('meeting_notes')
        .update({ notes })
        .eq('id', noteId)
        .eq('created_by', user?.id);

      if (error) throw error;
    },
    onError: (error) => {
      console.error('Failed to update note:', error);
      toast.error('Failed to update note');
    },
  });

  // Add action item to meeting
  const addActionItemMutation = useMutation({
    mutationFn: async ({ 
      meetingId, 
      description, 
      assignedTo, 
      dueDate 
    }: { 
      meetingId: string; 
      description: string; 
      assignedTo?: string | null;
      dueDate?: string | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('meeting_action_items')
        .insert({
          meeting_id: meetingId,
          description,
          assigned_to: assignedTo || null,
          due_date: dueDate || null,
          created_by: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Action item added');
    },
    onError: (error) => {
      console.error('Failed to add action item:', error);
      toast.error('Failed to add action item');
    },
  });

  // Update action item status
  const updateActionItemMutation = useMutation({
    mutationFn: async ({ 
      itemId, 
      status 
    }: { 
      itemId: string; 
      status: 'open' | 'in_progress' | 'completed' | 'cancelled';
    }) => {
      const { error } = await supabase
        .from('meeting_action_items')
        .update({ status })
        .eq('id', itemId)
        .eq('created_by', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Action item updated');
    },
    onError: (error) => {
      console.error('Failed to update action item:', error);
      toast.error('Failed to update action item');
    },
  });

  // Sync meetings from Outlook/Teams
  const syncMeetingsMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('sync-outlook-calendar', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { includeMeetings: true },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data?.synced || 0} events`);
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events-shared'] });
    },
    onError: (error) => {
      console.error('Sync failed:', error);
      toast.error('Failed to sync meetings');
    },
  });

  // Statistics
  const stats = useMemo(() => {
    const total = meetings.length;
    const needsLinking = meetings.filter(m => m.needs_linking).length;
    const noTimeDraft = meetings.filter(m => !m.time_draft_created && m.status === 'completed').length;
    const completed = meetings.filter(m => m.status === 'completed').length;
    const upcoming = meetings.filter(m => m.status === 'scheduled').length;

    return { total, needsLinking, noTimeDraft, completed, upcoming };
  }, [meetings]);

  return {
    // State
    filter,
    setFilter,
    dateRange,
    setDateRange,

    // Data
    meetings,
    isLoading,
    stats,

    // Detail fetchers
    fetchParticipants,
    fetchNotes,
    fetchActionItems,

    // Actions
    refetch,
    syncMeetings: syncMeetingsMutation.mutate,
    isSyncing: syncMeetingsMutation.isPending,
    linkToClient: linkToClientMutation.mutate,
    isLinking: linkToClientMutation.isPending,
    createTimeDraft: createTimeDraftMutation.mutate,
    isCreatingTimeDraft: createTimeDraftMutation.isPending,
    addNote: addNoteMutation.mutate,
    updateNote: updateNoteMutation.mutate,
    addActionItem: addActionItemMutation.mutate,
    updateActionItem: updateActionItemMutation.mutate,
  };
}
