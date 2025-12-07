import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { EosVtoDraft, EosChartDraft } from '@/types/eos';

export const useEosVtoDrafts = (meetingId?: string) => {
  const queryClient = useQueryClient();

  const { data: draft, isLoading } = useQuery({
    queryKey: ['eos-vto-draft', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto_drafts')
        .select('*')
        .eq('meeting_id', meetingId!)
        .maybeSingle();
      
      if (error) throw error;
      return data as EosVtoDraft | null;
    },
    enabled: !!meetingId,
  });

  const proposeDraft = useMutation({
    mutationFn: async (draftJson: Record<string, any>) => {
      const { data, error } = await supabase.rpc('propose_vto_change', {
        p_meeting_id: meetingId,
        p_draft_json: draftJson,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-vto-draft'] });
      toast({ title: 'V/TO draft saved successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error saving V/TO draft', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    draft,
    isLoading,
    proposeDraft,
  };
};

export const useEosChartDrafts = (meetingId?: string) => {
  const queryClient = useQueryClient();

  const { data: draft, isLoading } = useQuery({
    queryKey: ['eos-chart-draft', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_chart_drafts')
        .select('*')
        .eq('meeting_id', meetingId!)
        .maybeSingle();
      
      if (error) throw error;
      return data as EosChartDraft | null;
    },
    enabled: !!meetingId,
  });

  const proposeDraft = useMutation({
    mutationFn: async (draftJson: Record<string, any>) => {
      const { data, error } = await supabase.rpc('propose_chart_change', {
        p_meeting_id: meetingId,
        p_draft_json: draftJson,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-chart-draft'] });
      toast({ title: 'Chart draft saved successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error saving chart draft', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    draft,
    isLoading,
    proposeDraft,
  };
};
