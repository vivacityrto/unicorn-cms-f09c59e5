import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { MeetingType, EosMeeting } from '@/types/eos';

export interface MeetingSeries {
  id: string;
  tenant_id: number;
  meeting_type: MeetingType;
  title: string;
  description?: string;
  agenda_template_id?: string;
  agenda_template_version_id?: string;
  recurrence_type: 'one_time' | 'weekly' | 'quarterly' | 'annual';
  recurrence_rule?: string;
  start_date: string;
  start_time: string;
  duration_minutes: number;
  location?: string;
  timezone: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingInstance extends EosMeeting {
  series_id?: string;
  agenda_snapshot?: Record<string, any>;
  actual_duration_minutes?: number;
  started_at?: string;
  closed_at?: string;
  recurrence_type?: string;
  series_is_active?: boolean;
  series_title?: string;
  status?: string;
}

export const useMeetingSeries = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all series for tenant
  const { data: series, isLoading: isLoadingSeries } = useQuery({
    queryKey: ['eos-meeting-series', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_series')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MeetingSeries[];
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch upcoming meetings
  const { data: upcomingMeetings, isLoading: isLoadingUpcoming } = useQuery({
    queryKey: ['eos-upcoming-meetings', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .in('status', ['scheduled', 'in_progress'])
        .gte('scheduled_date', new Date().toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data as MeetingInstance[];
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch past meetings
  const { data: pastMeetings, isLoading: isLoadingPast } = useQuery({
    queryKey: ['eos-past-meetings', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .or(`status.in.(closed,completed,cancelled),and(status.eq.scheduled,scheduled_date.lt.${new Date().toISOString()})`)
        .order('scheduled_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as MeetingInstance[];
    },
    enabled: !!profile?.tenant_id,
  });

  // Create a new meeting series
  const createSeries = useMutation({
    mutationFn: async (params: {
      meeting_type: MeetingType;
      title: string;
      recurrence_type: 'one_time' | 'weekly' | 'quarterly' | 'annual';
      start_date: string;
      start_time?: string;
      duration_minutes?: number;
      location?: string;
      template_id?: string;
      template_version_id?: string;
      weeks_ahead?: number;
    }) => {
      const { data, error } = await supabase.rpc('create_meeting_series', {
        p_tenant_id: profile?.tenant_id!,
        p_meeting_type: params.meeting_type,
        p_title: params.title,
        p_recurrence_type: params.recurrence_type,
        p_start_date: params.start_date,
        p_start_time: params.start_time || '09:00',
        p_duration_minutes: params.duration_minutes || 90,
        p_location: params.location || null,
        p_template_id: params.template_id || null,
        p_template_version_id: params.template_version_id || null,
        p_weeks_ahead: params.weeks_ahead || 6,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-series'] });
      queryClient.invalidateQueries({ queryKey: ['eos-upcoming-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ title: 'Meeting series created', description: 'Upcoming instances have been generated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating series', description: error.message, variant: 'destructive' });
    },
  });

  // Update a series (future instances only)
  const updateSeries = useMutation({
    mutationFn: async (params: {
      series_id: string;
      title?: string;
      template_id?: string;
      template_version_id?: string;
      location?: string;
      duration_minutes?: number;
      start_time?: string;
    }) => {
      const { data, error } = await supabase.rpc('update_meeting_series', {
        p_series_id: params.series_id,
        p_title: params.title || null,
        p_template_id: params.template_id || null,
        p_template_version_id: params.template_version_id || null,
        p_location: params.location || null,
        p_duration_minutes: params.duration_minutes || null,
        p_start_time: params.start_time || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-series'] });
      queryClient.invalidateQueries({ queryKey: ['eos-upcoming-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ 
        title: 'Series updated', 
        description: 'Changes will apply to future meetings only. Past meetings remain unchanged.' 
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating series', description: error.message, variant: 'destructive' });
    },
  });

  // Generate more instances for a series
  const generateInstances = useMutation({
    mutationFn: async (params: { series_id: string; weeks_ahead?: number }) => {
      const { data, error } = await supabase.rpc('generate_series_instances', {
        p_series_id: params.series_id,
        p_weeks_ahead: params.weeks_ahead || 6,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eos-upcoming-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      const count = Array.isArray(data) ? data.length : 0;
      toast({ title: 'Instances generated', description: `Created ${count} new meeting instances.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error generating instances', description: error.message, variant: 'destructive' });
    },
  });

  // Start a meeting instance (locks agenda)
  const startMeeting = useMutation({
    mutationFn: async (meetingId: string) => {
      const { data, error } = await supabase.rpc('start_meeting_instance', {
        p_meeting_id: meetingId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-upcoming-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error starting meeting', description: error.message, variant: 'destructive' });
    },
  });

  // Complete a meeting instance
  const completeMeeting = useMutation({
    mutationFn: async (meetingId: string) => {
      const { data, error } = await supabase.rpc('complete_meeting_instance', {
        p_meeting_id: meetingId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-upcoming-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['eos-past-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ title: 'Meeting completed', description: 'Meeting has been closed and saved.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error completing meeting', description: error.message, variant: 'destructive' });
    },
  });

  return {
    series,
    upcomingMeetings,
    pastMeetings,
    isLoading: isLoadingSeries || isLoadingUpcoming || isLoadingPast,
    isLoadingSeries,
    isLoadingUpcoming,
    isLoadingPast,
    createSeries,
    updateSeries,
    generateInstances,
    startMeeting,
    completeMeeting,
  };
};
