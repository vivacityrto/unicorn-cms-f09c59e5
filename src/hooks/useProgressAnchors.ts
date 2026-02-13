/**
 * useProgressAnchors – Unicorn 2.0
 *
 * Fetches deterministic action counts from v_phase_actions_remaining.
 * Falls back to v_progress_anchor_inputs for overall_score and stale data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProgressAnchorData {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  client_name: string;
  package_name: string;
  package_type: string | null;
  overall_score: number;
  days_stale: number;
  is_stale: boolean;
  has_active_critical: boolean;
  // Deterministic counts from v_phase_actions_remaining
  phase_name: string | null;
  phase_key: string | null;
  checklist_remaining: number;
  docs_remaining: number;
  meetings_remaining: number;
  approvals_remaining: number;
  risks_blocking: number;
  total_actions_remaining: number;
  next_milestone_label: string | null;
}

export function useProgressAnchors(tenantId: number | null, packageInstanceId?: number | null) {
  return useQuery({
    queryKey: ['progress-anchors', tenantId, packageInstanceId],
    queryFn: async (): Promise<ProgressAnchorData[]> => {
      if (!tenantId) return [];

      // Fetch deterministic action counts
      let actionsQuery = supabase
        .from('v_phase_actions_remaining' as any)
        .select('*')
        .eq('tenant_id', tenantId);

      if (packageInstanceId) {
        actionsQuery = actionsQuery.eq('package_instance_id', packageInstanceId);
      }

      // Fetch anchor inputs for overall_score and stale data
      let anchorQuery = supabase
        .from('v_progress_anchor_inputs' as any)
        .select('*')
        .eq('tenant_id', tenantId);

      if (packageInstanceId) {
        anchorQuery = anchorQuery.eq('package_instance_id', packageInstanceId);
      }

      const [actionsRes, anchorsRes] = await Promise.all([
        actionsQuery,
        anchorQuery,
      ]);

      if (actionsRes.error) throw actionsRes.error;

      const actions = (actionsRes.data ?? []) as any[];
      const anchors = (anchorsRes.data ?? []) as any[];

      // Build anchor lookup by package_instance_id
      const anchorMap = new Map<number, any>();
      anchors.forEach((a: any) => anchorMap.set(a.package_instance_id, a));

      return actions.map((a: any): ProgressAnchorData => {
        const anchor = anchorMap.get(a.package_instance_id);
        return {
          tenant_id: a.tenant_id,
          package_instance_id: a.package_instance_id,
          package_id: a.package_id,
          client_name: a.client_name,
          package_name: a.package_name,
          package_type: a.package_type ?? null,
          overall_score: anchor?.overall_score ?? 0,
          days_stale: anchor?.days_stale ?? 0,
          is_stale: (anchor?.days_stale ?? 0) > 14,
          has_active_critical: a.risks_blocking > 0,
          phase_name: a.phase_name ?? null,
          phase_key: a.phase_key ?? null,
          checklist_remaining: a.checklist_remaining ?? 0,
          docs_remaining: a.docs_remaining ?? 0,
          meetings_remaining: a.meetings_remaining ?? 0,
          approvals_remaining: a.approvals_remaining ?? 0,
          risks_blocking: a.risks_blocking ?? 0,
          total_actions_remaining: a.total_actions_remaining ?? 0,
          next_milestone_label: a.next_milestone_label ?? null,
        };
      });
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}
