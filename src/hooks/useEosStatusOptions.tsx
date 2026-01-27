import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RiskOpportunityStatus } from '@/types/risksOpportunities';

/**
 * Hook to fetch EOS issue status options from the database enum.
 * This ensures the UI always uses valid enum values.
 */
export const useEosStatusOptions = () => {
  return useQuery({
    queryKey: ['eos-issue-status-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issue_status_options')
        .select('value');
      
      if (error) throw error;
      
      // Return the values directly - they are already properly cased from the enum
      return (data || []).map(row => row.value as RiskOpportunityStatus);
    },
    staleTime: Infinity, // Enum values don't change during runtime
  });
};
