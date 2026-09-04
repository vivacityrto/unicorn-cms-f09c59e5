import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { EosSegueShare } from '@/types/eos';

export const useEosSegueShares = (meetingId: string | undefined) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch shares, then names separately - eos_segue_shares.user_id has no
  // bridging FK to public.users (same as eos_meeting_participants), so no
  // PostgREST embed hint can resolve first_name/last_name in one request.
  const { data: segueShares, isLoading } = useQuery({
    queryKey: ['eos-segue-shares', meetingId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('eos_segue_shares')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userIds = (rows ?? []).map((s) => s.user_id).filter(Boolean);
      const { data: userRows, error: userError } = userIds.length
        ? await supabase
            .from('users')
            .select('user_uuid, first_name, last_name')
            .in('user_uuid', userIds)
        : { data: [], error: null };
      if (userError) throw userError;

      const userMap = new Map((userRows ?? []).map((u) => [u.user_uuid, u]));
      return (rows ?? []).map((s) => ({ ...s, users: userMap.get(s.user_id) ?? null })) as EosSegueShare[];
    },
    enabled: !!meetingId,
  });

  const createSegueShare = useMutation({
    mutationFn: async (share: Omit<Partial<EosSegueShare>, 'users'> & { meeting_id: string; personal_win: string; professional_win: string }) => {
      const { data, error } = await supabase
        .from('eos_segue_shares')
        .insert({
          ...share,
          user_id: profile?.user_uuid,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-segue-shares', meetingId] });
      toast({ title: 'Shared successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error sharing', description: error.message, variant: 'destructive' });
    },
  });

  const deleteSegueShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_segue_shares')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-segue-shares', meetingId] });
      toast({ title: 'Removed successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error removing', description: error.message, variant: 'destructive' });
    },
  });

  return {
    segueShares,
    isLoading,
    createSegueShare,
    deleteSegueShare,
  };
};
