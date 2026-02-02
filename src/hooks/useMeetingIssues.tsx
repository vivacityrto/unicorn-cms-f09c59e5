import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EosIssue } from '@/types/eos';

export const useMeetingIssues = (meetingId?: string, tenantId?: number) => {
  const { data: issues, isLoading, refetch } = useQuery({
    queryKey: ['meeting-issues', meetingId, tenantId],
    queryFn: async () => {
      // Fetch issues where:
      // 1. meeting_id equals this meeting (any status), OR
      // 2. meeting_id is NULL AND status is 'Open' (backlog items)
      const { data, error } = await supabase
        .from('eos_issues')
        .select('*')
        .eq('tenant_id', tenantId!)
        .or(`meeting_id.eq.${meetingId},and(meeting_id.is.null,status.eq.Open)`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as EosIssue[];
    },
    enabled: !!meetingId && !!tenantId,
  });

  return {
    issues,
    isLoading,
    refetch,
  };
};
