import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { EosHeadline } from '@/types/eos';

export const useEosHeadlines = (meetingId: string | undefined) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: headlines, isLoading } = useQuery({
    queryKey: ['eos-headlines', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_headlines')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as EosHeadline[];
    },
    enabled: !!meetingId,
  });

  const createHeadline = useMutation({
    mutationFn: async (headline: Partial<EosHeadline>) => {
      const { data, error } = await supabase
        .from('eos_headlines')
        .insert({
          ...headline,
          user_id: profile?.user_uuid,
        } as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-headlines', meetingId] });
      toast({ title: 'Headline added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding headline', description: error.message, variant: 'destructive' });
    },
  });

  const deleteHeadline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_headlines')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-headlines', meetingId] });
      toast({ title: 'Headline deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting headline', description: error.message, variant: 'destructive' });
    },
  });

  return {
    headlines,
    isLoading,
    createHeadline,
    deleteHeadline,
  };
};
