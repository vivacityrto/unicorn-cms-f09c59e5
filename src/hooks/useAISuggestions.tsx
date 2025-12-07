import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AISuggestion {
  id: string;
  tenant_id: number;
  meeting_id?: string;
  scope: 'pre_meeting' | 'in_meeting';
  suggestion_type: 'issue' | 'priority' | 'todo';
  payload: any;
  status: 'shown' | 'accepted' | 'dismissed';
  created_at: string;
}

export const useAISuggestions = (meetingId?: string, tenantId?: number) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['ai-suggestions', meetingId, tenantId],
    queryFn: async () => {
      let query = supabase
        .from('ai_suggestions')
        .select('*')
        .eq('status', 'shown')
        .order('created_at', { ascending: false });

      if (meetingId) {
        query = query.eq('meeting_id', meetingId);
      } else if (tenantId) {
        query = query.eq('tenant_id', tenantId).is('meeting_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AISuggestion[];
    },
    enabled: !!meetingId || !!tenantId,
  });

  const generateSuggestions = useMutation({
    mutationFn: async ({ meeting_id, tenant_id }: { meeting_id?: string; tenant_id: number }) => {
      const { data, error } = await supabase.functions.invoke('ai-generate-suggestions', {
        body: { meeting_id, tenant_id }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Store suggestions in database
      const suggestionsToInsert = data.suggestions.map((s: any) => ({
        tenant_id: tenantId,
        meeting_id: meetingId,
        scope: meetingId ? 'in_meeting' : 'pre_meeting',
        suggestion_type: s.type,
        payload: s,
        status: 'shown'
      }));

      supabase
        .from('ai_suggestions')
        .insert(suggestionsToInsert)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['ai-suggestions'] });
          toast({ title: 'AI suggestions generated' });
        });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to generate suggestions',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const acceptSuggestion = useMutation({
    mutationFn: async (suggestionId: string) => {
      const { data, error } = await supabase.rpc('accept_ai_suggestion', {
        p_suggestion_id: suggestionId
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
      toast({ title: 'Suggestion accepted' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to accept suggestion',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const dismissSuggestion = useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('ai_suggestions')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-suggestions'] });
      toast({ title: 'Suggestion dismissed' });
    },
  });

  return {
    suggestions,
    isLoading,
    generateSuggestions,
    acceptSuggestion,
    dismissSuggestion,
  };
};
