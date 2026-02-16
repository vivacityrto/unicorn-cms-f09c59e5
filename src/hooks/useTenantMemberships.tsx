import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ScopeTag = 'both' | 'rto' | 'cricos';

export interface TenantMembershipContext {
  hasDualMembership: boolean;
  hasRtoOnly: boolean;
  hasCricosOnly: boolean;
  hasNoMembership: boolean;
  rtoPackageInstanceId: number | null;
  cricosPackageInstanceId: number | null;
  /** Default scope for this tenant */
  defaultScope: ScopeTag;
  /** Should the scope selector be shown? */
  showScopeSelector: boolean;
  loading: boolean;
}

export function useTenantMemberships(tenantId: number | null): TenantMembershipContext {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-memberships', tenantId],
    queryFn: async () => {
      if (!tenantId) return { rto: null, cricos: null };
      const { data, error } = await supabase.rpc('get_active_membership_packages', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        rto: row?.rto_package_instance_id ?? null,
        cricos: row?.cricos_package_instance_id ?? null,
      };
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const rto = data?.rto ?? null;
  const cricos = data?.cricos ?? null;
  const hasDual = !!rto && !!cricos;
  const hasRtoOnly = !!rto && !cricos;
  const hasCricosOnly = !rto && !!cricos;
  const hasNone = !rto && !cricos;

  return {
    hasDualMembership: hasDual,
    hasRtoOnly,
    hasCricosOnly,
    hasNoMembership: hasNone,
    rtoPackageInstanceId: rto ? Number(rto) : null,
    cricosPackageInstanceId: cricos ? Number(cricos) : null,
    defaultScope: hasDual ? 'both' : hasRtoOnly ? 'rto' : hasCricosOnly ? 'cricos' : 'both',
    showScopeSelector: hasDual,
    loading: isLoading,
  };
}

/** Fetch the allocation weights for a tenant */
export function useMembershipWeights(tenantId: number | null) {
  return useQuery({
    queryKey: ['membership-weights', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('membership_allocation_groups')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

/** Fetch combined membership usage for a tenant */
export function useMembershipUsage(tenantId: number | null) {
  return useQuery({
    queryKey: ['membership-combined-usage', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('v_membership_combined_usage')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}
