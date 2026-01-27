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

  // Fetch participants for this meeting
  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ['eos-meeting-participants', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      
      // Fetch participants without join to avoid FK issues
      const { data: participantsData, error: participantsError } = await supabase
        .from('eos_meeting_participants')
        .select('*')
        .eq('meeting_id', meetingId);
      
      if (participantsError) throw participantsError;
      
      // Fetch user details separately
      const userIds = participantsData?.map(p => p.user_id).filter(Boolean) || [];
      if (userIds.length === 0) return [];
      
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', userIds);
      
      if (usersError) throw usersError;
      
      // Merge data
      const usersMap = new Map(usersData?.map(u => [u.user_uuid, u]) || []);
      
      return participantsData?.map(p => ({
        ...p,
        users: usersMap.get(p.user_id) || null
      })) as Participant[];
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
