import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EosIssue } from '@/types/eos';

export const useMeetingIssues = (meetingId?: string) => {
  const { data: issues, isLoading } = useQuery({
    queryKey: ['meeting-issues', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issues')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as EosIssue[];
    },
    enabled: !!meetingId,
  });

  return {
    issues,
    isLoading,
  };
};
