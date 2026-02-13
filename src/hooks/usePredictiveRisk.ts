/**
 * usePredictiveRisk – Unicorn 2.0
 *
 * Fetches the latest predictive operational risk snapshot per package instance.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RiskBand = 'stable' | 'watch' | 'at_risk' | 'immediate_attention';

export interface PredictiveRiskSnapshot {
  id: string;
  tenant_id: number;
  package_instance_id: number;
  activity_decay: boolean;
  severe_activity_decay: boolean;
  risk_escalation: boolean;
  backlog_growth: boolean;
  sustained_backlog_growth: boolean;
  burn_rate_risk: boolean;
  phase_drift: boolean;
  operational_risk_score: number;
  risk_band: RiskBand;
  inputs: Record<string, unknown>;
  calculated_at: string;
}

export function usePredictiveRisk(tenantId: number | null, packageInstanceId?: number | null) {
  return useQuery({
    queryKey: ['predictive-risk', tenantId, packageInstanceId],
    queryFn: async (): Promise<PredictiveRiskSnapshot[]> => {
      if (!tenantId) return [];

      let query = supabase
        .from('predictive_operational_risk_snapshots' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('calculated_at', { ascending: false });

      if (packageInstanceId) {
        query = query.eq('package_instance_id', packageInstanceId);
      }

      // Get only latest per package_instance_id via distinct
      const { data, error } = await query.limit(50);
      if (error) throw error;

      // Deduplicate: keep only latest per package_instance_id
      const seen = new Set<number>();
      const latest: PredictiveRiskSnapshot[] = [];
      for (const row of (data ?? []) as unknown as PredictiveRiskSnapshot[]) {
        if (!seen.has(row.package_instance_id)) {
          seen.add(row.package_instance_id);
          latest.push(row);
        }
      }

      return latest;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

/** Intervention suggestion mapping */
export function getInterventionSuggestion(snapshot: PredictiveRiskSnapshot): {
  label: string;
  href: string;
  signal: string;
} | null {
  if (snapshot.activity_decay) {
    return {
      label: 'Schedule check-in meeting',
      href: `/manage-tenants/${snapshot.tenant_id}`,
      signal: `Activity has dropped ${Math.round((1 - (snapshot.inputs.activity_trend_ratio as number ?? 0)) * 100)}% this week.`,
    };
  }
  if (snapshot.risk_escalation) {
    return {
      label: 'Review high priority risks',
      href: `/manage-tenants/${snapshot.tenant_id}`,
      signal: `${snapshot.inputs.new_high_risks_7d ?? 0} new high/critical risks in the last 7 days.`,
    };
  }
  if (snapshot.backlog_growth) {
    return {
      label: 'Upload missing documents',
      href: `/manage-tenants/${snapshot.tenant_id}`,
      signal: `${snapshot.inputs.missing_docs_now ?? 0} documents still pending.`,
    };
  }
  if (snapshot.burn_rate_risk) {
    return {
      label: 'Review consult allocation',
      href: `/manage-tenants/${snapshot.tenant_id}`,
      signal: `Projected ${snapshot.inputs.projected_days_to_exhaustion ?? 0} days until hours exhausted.`,
    };
  }
  if (snapshot.phase_drift) {
    return {
      label: 'Complete next checklist item',
      href: `/manage-tenants/${snapshot.tenant_id}`,
      signal: `Phase stagnant for ${snapshot.inputs.days_in_current_phase ?? 0} days with ${snapshot.inputs.actions_remaining ?? 0} actions remaining.`,
    };
  }
  return null;
}
