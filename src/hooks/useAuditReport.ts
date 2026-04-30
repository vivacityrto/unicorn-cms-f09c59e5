import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { autoCompleteStageTasks } from '@/hooks/useStageAuditLink';

// ─── Wave 4 #2: AI Executive Summary ─────────────────────────────────
// Types mirror the draft-executive-summary edge function response shape.
export interface ExecSummaryDraft {
  executive_summary: string;
  overall_finding: string;
  risk_rationale: string;
  action_plan_rollup: {
    introduction: string;
    priority_groups: Array<{
      priority: 'critical' | 'high' | 'medium';
      narrative: string;
      actions: Array<{ summary: string; linked_finding_ids: string[] }>;
    }>;
    closing: string;
  };
  confidence: 'high' | 'medium' | 'low';
  uncertainty_notes: string | null;
}

export interface ExecSummaryResponse {
  draft: ExecSummaryDraft;
  source_summary: {
    audit_id: string;
    audit_type: string | null;
    total_findings: number;
    findings_by_priority: { critical: number; high: number; medium: number };
    risk_rating: string | null;
    framework: string | null;
  };
  ai_metadata: {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    duration_ms: number;
  };
  log_id: string;
}

export function useDraftExecutiveSummary(auditId: string | undefined) {
  return useMutation<ExecSummaryResponse, Error, void>({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');
      const { data, error } = await supabase.functions.invoke('draft-executive-summary', {
        body: { audit_id: auditId },
      });
      if (error) {
        // FunctionsHttpError exposes structured response — try to surface server message.
        const ctx: any = (error as any).context;
        let serverMsg = error.message;
        try {
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json();
            if (j?.error) serverMsg = j.error;
          }
        } catch { /* fall through */ }
        throw new Error(serverMsg);
      }
      return data as ExecSummaryResponse;
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to draft executive summary');
    },
  });
}

export type DecisionField = 'accepted' | 'edited' | 'rejected';

export interface RecordExecSummaryDecisionInput {
  draft_log_id: string;
  audit_id: string;
  executive_summary?: { decision: DecisionField; edit_distance_pct: number | null } | null;
  overall_finding?: { decision: DecisionField; edit_distance_pct: number | null } | null;
  risk_rationale?: { decision: DecisionField; edit_distance_pct: number | null } | null;
}

export function useRecordExecutiveSummaryDecision() {
  return useMutation({
    mutationFn: async (input: RecordExecSummaryDecisionInput) => {
      const { error } = await supabase.functions.invoke('record-executive-summary-decision', {
        body: input,
      });
      if (error) throw error;
    },
    // Best-effort telemetry — don't toast on failure.
    onError: (err) => console.warn('Failed to record exec-summary decision:', err),
  });
}

export function useReleaseReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseNotes }: { releaseNotes?: string }) => {
      if (!auditId) throw new Error('No audit ID');
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .rpc('release_audit_report', {
          p_audit_id: auditId,
          p_released_by: user?.id,
          p_release_notes: releaseNotes || null,
        } as any);
      if (error) throw error;

      // Auto-complete stage tasks on report release
      await autoCompleteStageTasks(auditId, 'report_released');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Report released to client');
    },
    onError: (err: any) => {
      toast.error('Failed to release report: ' + (err.message || 'Unknown error'));
    },
  });
}

export function useAcknowledgeReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');
      const { error } = await supabase
        .rpc('acknowledge_audit_report', { p_audit_id: auditId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit-reports'] });
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Report acknowledged');
    },
  });
}

export function useRevokeReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');
      const { error } = await supabase
        .from('client_audits' as any)
        .update({ report_client_visible: false } as any)
        .eq('id', auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Client access revoked');
    },
  });
}
