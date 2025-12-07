import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { EosScorecardMetric } from '@/types/eos';

export const useEosScorecardMetrics = () => {
  const { profile } = useAuth();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['eos-scorecard-metrics', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as EosScorecardMetric[];
    },
    enabled: !!profile?.tenant_id,
  });

  return {
    metrics,
    isLoading,
  };
};
