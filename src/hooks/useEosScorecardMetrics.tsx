import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { EosScorecardMetric } from '@/types/eos';

export const useEosScorecardMetrics = () => {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['eos-scorecard-metrics', isSuper ? 'all' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_scorecard_metrics')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      // SuperAdmins see all data; others filter by their tenant
      if (!isSuper && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EosScorecardMetric[];
    },
    enabled: isSuper || !!profile?.tenant_id,
  });

  return {
    metrics,
    isLoading,
  };
};