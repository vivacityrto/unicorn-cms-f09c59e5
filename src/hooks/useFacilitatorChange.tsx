import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Participant {
  id: string;
  user_id: string;
  role: 'Leader' | 'Member' | 'Observer';
  users?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export const useFacilitatorChange = (meetingId: string | undefined) => {
  const queryClient = useQueryClient();

  // Fetch participants for this meeting with explicit FK join
  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ['eos-meeting-participants', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      
      const { data, error } = await supabase
        .from('eos_meeting_participants')
        .select('*, users!eos_meeting_participants_user_id_users_fkey(first_name, last_name)')
        .eq('meeting_id', meetingId);
      
      if (error) throw error;
      
      return data as Participant[];
    },
    enabled: !!meetingId,
  });

  // Get current facilitator
  const currentFacilitator = participants?.find(p => p.role === 'Leader');

  // Mutation to change facilitator
  const changeFacilitator = useMutation({
    mutationFn: async (newFacilitatorId: string) => {
      const { data, error } = await supabase.rpc('change_meeting_facilitator', {
        p_meeting_id: meetingId!,
        p_new_facilitator_id: newFacilitatorId
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-participants', meetingId] });
      toast({ title: 'Facilitator updated successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to change facilitator', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  return {
    participants,
    participantsLoading,
    currentFacilitator,
    changeFacilitator,
  };
};
