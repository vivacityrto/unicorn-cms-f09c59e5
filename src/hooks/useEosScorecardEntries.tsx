import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { EosScorecardEntry } from '@/types/eos';

export const useEosScorecardEntries = (metricId?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ['eos-scorecard-entries', metricId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_scorecard_entries')
        .select('*')
        .eq('metric_id', metricId!)
        .eq('tenant_id', profile?.tenant_id!)
        .order('week_ending', { ascending: false })
        .limit(13);
      
      if (error) throw error;
      return data as EosScorecardEntry[];
    },
    enabled: !!metricId && !!profile?.tenant_id,
  });

  const createEntry = useMutation({
    mutationFn: async (entry: Partial<EosScorecardEntry>) => {
      const { data, error } = await supabase
        .from('eos_scorecard_entries')
        .insert([{
          metric_id: entry.metric_id!,
          week_ending: entry.week_ending!,
          value: entry.value!,
          notes: entry.notes,
          tenant_id: profile?.tenant_id!,
          entered_by: profile?.user_uuid!,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-entries'] });
      toast({ title: 'Entry recorded successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error recording entry', description: error.message, variant: 'destructive' });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosScorecardEntry> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_scorecard_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-entries'] });
      toast({ title: 'Entry updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating entry', description: error.message, variant: 'destructive' });
    },
  });

  return {
    entries,
    isLoading,
    createEntry,
    updateEntry,
  };
};
