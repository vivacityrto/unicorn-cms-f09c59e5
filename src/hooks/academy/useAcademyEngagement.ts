import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { academyEngagementSchema, validateCohortDates } from '@/lib/academy/engagementDashboard';

export interface EngagementFilters { from: string; to: string; tenantId: string; source: 'self_enrol' | 'all' }
export function useAcademyEngagement(filters: EngagementFilters) {
  const { user } = useAuth();
  return useQuery({
    // Identity in cache key avoids reusing another signed-in staff member's result.
    queryKey: ['academy-engagement', user?.id, filters],
    enabled: !!user && validateCohortDates(filters.from, filters.to),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_academy_engagement_dashboard', {
        p_from: filters.from || null, p_to: filters.to || null,
        p_tenant_id: filters.tenantId === 'all' ? null : Number(filters.tenantId),
        p_source: filters.source,
      });
      if (error) throw error;
      return academyEngagementSchema.parse(data);
    },
    staleTime: 30_000,
    retry: false,
  });
}
