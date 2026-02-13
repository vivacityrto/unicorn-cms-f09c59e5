/**
 * useComplianceScore – Unicorn 2.0
 *
 * Fetches latest compliance score from v_compliance_score_latest.
 * Provides recalculate() to trigger server-side calculation.
 * Debounced: max once per 60s per package instance.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRef, useCallback } from 'react';

export interface ComplianceScore {
  id: string;
  tenant_id: number;
  package_instance_id: number;
  phase_completion: number;
  documentation_coverage: number;
  risk_health: number;
  consult_health: number;
  overall_score: number;
  days_stale: number;
  is_stale: boolean;
  caps_applied: Array<{ type: string; cap: number; [key: string]: any }>;
  inputs: {
    total_stages: number;
    completed_stages: number;
    total_required_docs: number;
    present_docs: number;
    risk_points: number;
    hours_included: number;
    hours_used: number;
    hours_added: number;
    critical_risk_count: number;
    last_activity: string | null;
  };
  calculated_at: string;
  calculated_by_user_uuid: string | null;
}

const DEBOUNCE_MS = 60_000; // 60 second debounce

export function useComplianceScore(tenantId: number | null, packageInstanceId: number | null) {
  const queryClient = useQueryClient();
  const lastCalcRef = useRef<number>(0);

  const queryKey = ['compliance-score', tenantId, packageInstanceId];

  const { data: score, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!tenantId || !packageInstanceId) return null;

      const { data, error } = await supabase
        .from('v_compliance_score_latest' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('package_instance_id', packageInstanceId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return data as unknown as ComplianceScore;
    },
    enabled: !!tenantId && !!packageInstanceId,
    staleTime: 30_000,
  });

  const calcMutation = useMutation({
    mutationFn: async ({ actorUserUuid }: { actorUserUuid: string }) => {
      if (!tenantId || !packageInstanceId) throw new Error('Missing tenant or package');

      const { data, error } = await supabase.rpc('calculate_compliance_score', {
        p_tenant_id: Number(tenantId),
        p_package_instance_id: Number(packageInstanceId),
        p_actor_user_uuid: actorUserUuid,
      });

      if (error) throw error;
      return data as unknown as ComplianceScore;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      lastCalcRef.current = Date.now();
    },
  });

  const recalculate = useCallback(
    (actorUserUuid: string) => {
      const now = Date.now();
      if (now - lastCalcRef.current < DEBOUNCE_MS) {
        console.log('[ComplianceScore] Debounced – skipping recalculation');
        return;
      }
      calcMutation.mutate({ actorUserUuid });
    },
    [calcMutation],
  );

  return {
    score,
    isLoading,
    error,
    recalculate,
    isRecalculating: calcMutation.isPending,
  };
}
