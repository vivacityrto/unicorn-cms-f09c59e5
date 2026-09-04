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

  // Fetch participants, then names separately - eos_meeting_participants.user_id
  // has a real FK to auth.users(id), not public.users, and there's no FK from
  // public.users to auth.users either, so no PostgREST embed hint can ever
  // resolve first_name/last_name in one request. Shares the same query key
  // as LiveMeetingView's own participants fetch, so this must stay fixed the
  // same way there too - a broken queryFn here would silently overwrite that
  // cache entry whenever this dialog mounts/refetches.
  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ['eos-meeting-participants', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];

      const { data: rows, error } = await supabase
        .from('eos_meeting_participants')
        .select('*')
        .eq('meeting_id', meetingId);

      if (error) throw error;

      const userIds = (rows ?? []).map((p) => p.user_id);
      const { data: userRows, error: userError } = userIds.length
        ? await supabase
            .from('users')
            .select('user_uuid, first_name, last_name')
            .in('user_uuid', userIds)
        : { data: [], error: null };
      if (userError) throw userError;

      const userMap = new Map((userRows ?? []).map((u) => [u.user_uuid, u]));
      return (rows ?? []).map((p) => ({ ...p, users: userMap.get(p.user_id) ?? null })) as Participant[];
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
