import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { EosMeetingSegment } from '@/types/eos';

export const useEosMeetingSegments = (meetingId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: segments, isLoading } = useQuery({
    queryKey: ['eos-meeting-segments', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_segments')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('sequence_order', { ascending: true });
      
      if (error) throw error;
      return data as EosMeetingSegment[];
    },
    enabled: !!meetingId,
  });

  const advanceSegment = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('advance_segment', {
        p_meeting_id: meetingId,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Wait for cache invalidation to complete before mutation is "done"
      await queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
      toast({ title: 'Advanced to next segment' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error advancing segment', description: error.message, variant: 'destructive' });
    },
  });

  const goToPreviousSegment = useMutation({
    mutationFn: async () => {
      // Type assertion needed - RPC exists but types.ts not regenerated
      const { data, error } = await (supabase.rpc as any)('go_to_previous_segment', {
        p_meeting_id: meetingId,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Wait for cache invalidation to complete before mutation is "done"
      await queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
      toast({ title: 'Returned to previous segment' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error returning to previous segment', description: error.message, variant: 'destructive' });
    },
  });

  return {
    segments,
    isLoading,
    advanceSegment,
    goToPreviousSegment,
  };
};
