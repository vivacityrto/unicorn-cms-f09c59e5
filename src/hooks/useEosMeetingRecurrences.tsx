import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface MeetingRecurrence {
  id: string;
  meeting_id: string;
  tenant_id: number;
  recurrence_type: 'weekly' | 'quarterly' | 'annual';
  rrule: string;
  start_date: string;
  until_date: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingOccurrence {
  id: string;
  recurrence_id: string;
  meeting_id: string | null;
  tenant_id: number;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'cancelled' | 'completed';
  is_generated: boolean;
  created_at: string;
  updated_at: string;
}

export const useEosMeetingRecurrences = (meetingId?: string, tenantId?: number) => {
  const queryClient = useQueryClient();

  // Fetch recurrences for a meeting
  const { data: recurrences, isLoading: isLoadingRecurrences } = useQuery({
    queryKey: ['eos-meeting-recurrences', meetingId],
    queryFn: async () => {
      if (!meetingId) return null;
      
      const { data, error } = await supabase
        .from('eos_meeting_recurrences')
        .select('*')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (error) throw error;
      return data as MeetingRecurrence | null;
    },
    enabled: !!meetingId,
  });

  // Fetch occurrences for a recurrence
  const { data: occurrences, isLoading: isLoadingOccurrences } = useQuery({
    queryKey: ['eos-meeting-occurrences', recurrences?.id],
    queryFn: async () => {
      if (!recurrences?.id) return [];
      
      const { data, error } = await supabase
        .from('eos_meeting_occurrences')
        .select('*')
        .eq('recurrence_id', recurrences.id)
        .order('starts_at', { ascending: true });

      if (error) throw error;
      return data as MeetingOccurrence[];
    },
    enabled: !!recurrences?.id,
  });

  // Fetch all occurrences for a tenant
  const { data: allOccurrences, isLoading: isLoadingAllOccurrences } = useQuery({
    queryKey: ['eos-all-occurrences', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('eos_meeting_occurrences')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });

      if (error) throw error;
      return data as MeetingOccurrence[];
    },
    enabled: !!tenantId,
  });

  // Generate recurrence
  const generateRecurrence = useMutation({
    mutationFn: async (params: {
      meeting_id: string;
      tenant_id: number;
      recurrence_type: 'weekly' | 'quarterly' | 'annual';
      start_date: string;
      start_time: string;
      duration_minutes: number;
      until_date?: string;
      timezone?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-meeting-recurrence', {
        body: params,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-recurrences'] });
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-occurrences'] });
      queryClient.invalidateQueries({ queryKey: ['eos-all-occurrences'] });
      toast({ title: 'Recurrence created successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error creating recurrence', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Cancel occurrence
  const cancelOccurrence = useMutation({
    mutationFn: async (occurrenceId: string) => {
      const { error } = await supabase.rpc('cancel_occurrence', {
        p_occurrence_id: occurrenceId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-occurrences'] });
      queryClient.invalidateQueries({ queryKey: ['eos-all-occurrences'] });
      toast({ title: 'Occurrence cancelled' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error cancelling occurrence', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Cancel series
  const cancelSeries = useMutation({
    mutationFn: async (recurrenceId: string) => {
      const { data, error } = await supabase.rpc('cancel_recurrence_series', {
        p_recurrence_id: recurrenceId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-occurrences'] });
      queryClient.invalidateQueries({ queryKey: ['eos-all-occurrences'] });
      toast({ title: `${count} future occurrences cancelled` });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error cancelling series', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    recurrences,
    occurrences,
    allOccurrences,
    isLoading: isLoadingRecurrences || isLoadingOccurrences,
    isLoadingAllOccurrences,
    generateRecurrence,
    cancelOccurrence,
    cancelSeries,
  };
};
