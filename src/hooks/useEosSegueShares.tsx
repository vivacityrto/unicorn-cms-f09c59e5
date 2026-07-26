import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { EosSegueShare } from '@/types/eos';

export const useEosSegueShares = (meetingId: string | undefined) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: segueShares, isLoading } = useQuery({
    queryKey: ['eos-segue-shares', meetingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eos_segue_shares')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as EosSegueShare[];
    },
    enabled: !!meetingId,
  });

  const createSegueShare = useMutation({
    mutationFn: async (share: Partial<EosSegueShare>) => {
      const { data, error } = await (supabase as any)
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
      const { error } = await (supabase as any)
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
