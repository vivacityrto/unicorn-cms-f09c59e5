import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { ConfigMeetingType } from '@/types/eos';

/**
 * RPCs backing Stage 2 ("type + date only" scheduling) and the
 * Configuration-derived meeting lifecycle actions added alongside it
 * (M6/M8 migrations).
 */
export const useEosConfigMeetingActions = () => {
  const queryClient = useQueryClient();

  const invalidateMeetingLists = () => {
    queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
    queryClient.invalidateQueries({ queryKey: ['eos-meeting-series'] });
  };

  const createMeetingFromConfiguration = useMutation({
    mutationFn: async ({ meetingType, scheduledDate }: { meetingType: ConfigMeetingType; scheduledDate: Date }) => {
      const { data, error } = await supabase.rpc('create_meeting_from_configuration', {
        p_meeting_type: meetingType,
        p_scheduled_date: scheduledDate.toISOString(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateMeetingLists();
      toast({ title: 'Meeting scheduled' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error scheduling meeting', description: error.message, variant: 'destructive' });
    },
  });

  const syncMeetingToConfiguration = useMutation({
    mutationFn: async (meetingId: string) => {
      const { error } = await supabase.rpc('sync_meeting_to_configuration', {
        p_meeting_id: meetingId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMeetingLists();
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments'] });
      toast({ title: 'Meeting synced to Configuration' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error syncing to Configuration', description: error.message, variant: 'destructive' });
    },
  });

  const skipMeetingOccurrence = useMutation({
    mutationFn: async ({ meetingId, reason }: { meetingId: string; reason?: string }) => {
      const { error } = await supabase.rpc('skip_meeting_occurrence', {
        p_meeting_id: meetingId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMeetingLists();
      toast({ title: 'Occurrence skipped', description: 'The next occurrence will still generate on schedule.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error skipping occurrence', description: error.message, variant: 'destructive' });
    },
  });

  return { createMeetingFromConfiguration, syncMeetingToConfiguration, skipMeetingOccurrence };
};
