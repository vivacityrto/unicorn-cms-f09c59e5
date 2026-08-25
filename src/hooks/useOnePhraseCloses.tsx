import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OnePhraseClose {
  id: string;
  meeting_id: string;
  user_id: string;
  phrase: string;
  created_at: string;
  updated_at: string;
}

interface SaveOnePhraseCloseResult {
  success: boolean;
  phrase?: string;
  error?: string;
}

export const useOnePhraseCloses = (meetingId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: closes, isLoading } = useQuery({
    queryKey: ['meeting-one-phrase-closes', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_one_phrase_closes')
        .select('*')
        .eq('meeting_id', meetingId!);
      if (error) throw error;
      return (data ?? []) as OnePhraseClose[];
    },
    enabled: !!meetingId,
  });

  const saveOnePhraseClose = useMutation({
    mutationFn: async (phrase: string): Promise<SaveOnePhraseCloseResult> => {
      const { data, error } = await supabase.rpc('save_one_phrase_close', {
        p_meeting_id: meetingId,
        p_phrase: phrase,
      });
      if (error) throw error;
      return data as unknown as SaveOnePhraseCloseResult;
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['meeting-one-phrase-closes', meetingId] });
      } else {
        toast.error(data.error || 'Failed to share your phrase');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to share your phrase: ${error.message}`);
    },
  });

  const getUserPhrase = (userId: string): string | undefined => {
    return closes?.find((c) => c.user_id === userId)?.phrase;
  };

  return {
    closes,
    isLoading,
    saveOnePhraseClose,
    getUserPhrase,
  };
};
