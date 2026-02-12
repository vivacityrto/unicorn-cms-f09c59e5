import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface RockSuggestion {
  title: string;
  description: string;
  issue: string;
  outcome: string;
  milestones: { text: string }[];
}

interface SuggestRockParams {
  rock_level: 'company' | 'team' | 'individual';
  tenant_id: number;
  parent_rock_id?: string;
  function_id?: string;
  owner_id?: string;
}

export function useAISuggestRock() {
  const [isGenerating, setIsGenerating] = useState(false);

  const suggestRock = async (params: SuggestRockParams): Promise<RockSuggestion | null> => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-suggest-rock', {
        body: params,
      });

      if (error) {
        const message = error.message || 'Failed to generate suggestion';
        toast({ title: 'AI Suggestion Failed', description: message, variant: 'destructive' });
        return null;
      }

      if (data?.error) {
        toast({ title: 'AI Suggestion Failed', description: data.error, variant: 'destructive' });
        return null;
      }

      return data as RockSuggestion;
    } catch (err) {
      toast({ title: 'AI Suggestion Failed', description: 'An unexpected error occurred.', variant: 'destructive' });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { suggestRock, isGenerating };
}
