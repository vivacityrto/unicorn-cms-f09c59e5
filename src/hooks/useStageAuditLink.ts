import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AuditType } from '@/types/clientAudits';

// Stage ID → audit type mapping
export const STAGE_AUDIT_TYPE_MAP: Record<number, AuditType> = {
  24: 'compliance_health_check',
  5: 'mock_audit',
  1106: 'mock_audit',
};

export const STAGE_LABEL_MAP: Record<number, string> = {
  24: 'CHC stage',
  5: 'Mock Audit stage',
  1106: 'Mock Audit stage',
  6: 'ASQA Audit stage',
};

// All audit-type stage IDs (excluding ASQA for prompt card)
export const AUDIT_STAGE_IDS = [24, 5, 1106];
export const ALL_AUDIT_STAGE_IDS = [24, 5, 1106, 6];

export function useStageAuditLink(stageInstanceId: number | undefined) {
  return useQuery({
    queryKey: ['stage-audit-link', stageInstanceId],
    enabled: !!stageInstanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_instances')
        .select('id, stage_id, linked_audit_id, packageinstance_id')
        .eq('id', stageInstanceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      let linkedAudit = null;

      if (data.linked_audit_id) {
        const { data: audit } = await supabase
          .from('client_audits')
          .select('id, title, status, score_pct, risk_rating, opening_meeting_at, closing_meeting_at, audit_type')
          .eq('id', data.linked_audit_id)
          .maybeSingle();
        linkedAudit = audit;
      }

      return {
        stageInstanceId: data.id,
        stageId: data.stage_id,
        linkedAuditId: data.linked_audit_id,
        packageInstanceId: data.packageinstance_id,
        linkedAudit,
      };
    },
  });
}

/**
 * Auto-complete stage tasks for an audit milestone.
 * Returns the count of tasks completed.
 */
export async function autoCompleteStageTasks(auditId: string, milestone: string): Promise<number> {
  try {
    const { data: count, error } = await supabase.rpc(
      'complete_audit_stage_tasks',
      { p_audit_id: auditId, p_milestone: milestone }
    );
    if (error) throw error;
    const n = count || 0;
    if (n > 0) {
      toast.success(`✓ ${n} stage task${n > 1 ? 's' : ''} auto-completed`);
    }
    return n;
  } catch {
    // Non-critical — RPC may not exist yet
    return 0;
  }
}
