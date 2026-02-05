import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { EosScorecardMetric } from '@/types/eos';

export const useEosScorecardMetrics = () => {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member (Super Admin, Team Leader, Team Member)
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['eos-scorecard-metrics', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_scorecard_metrics')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EosScorecardMetric[];
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  return {
    metrics,
    isLoading,
  };
};