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

function formatReleasedAt(iso: string | undefined | null): string {
  if (!iso) return 'an earlier date';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return 'an earlier date';
  }
}

const SUPABASE_URL = 'https://yxkgdalkbrriasiyyrwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY';

export function useReleaseReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseNotes }: { releaseNotes?: string }) => {
      if (!auditId) throw new Error('No audit ID');

      const trimmed = (releaseNotes ?? '').trim();
      if (trimmed.length > 4000) {
        toast.error('Release notes must be 4000 characters or fewer.');
        throw new Error('NOTES_TOO_LONG');
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Couldn't release the report. Try again, or contact support.");
        throw new Error('NO_SESSION');
      }

      let response: Response;
      try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/release-audit-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            audit_id: auditId,
            release_notes: trimmed.length > 0 ? trimmed : null,
          }),
        });
      } catch {
        toast.error("Couldn't release the report. Try again, or contact support.");
        throw new Error('NETWORK');
      }

      let body: any = {};
      try { body = await response.json(); } catch { /* empty body */ }

      if (response.status === 200) {
        toast.success('Report released to client');
        try { await autoCompleteStageTasks(auditId, 'report_released'); } catch { /* non-fatal */ }
        return { status: 200, body };
      }

      if (response.status === 409) {
        toast.info(`This report was already released on ${formatReleasedAt(body?.released_at)}`);
        return { status: 409, body };
      }

      if (response.status === 422) {
        toast.error(body?.error || 'This audit has no score yet — complete the audit first.');
        throw new Error('NO_SCORE');
      }

      if (response.status === 403) {
        toast.error(body?.error || "You don't have access to this audit.");
        throw new Error('FORBIDDEN');
      }

      // 401, 500, anything else
      toast.error("Couldn't release the report. Try again, or contact support.");
      throw new Error(`HTTP_${response.status}`);
    },
    onSuccess: (result) => {
      // Invalidate so the page reflects released state (covers both 200 and 409 refetch).
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audits'] });
    },
    // onError intentionally omitted — toasts are emitted inside mutationFn so we control
    // per-status copy. A generic onError toast would double-fire.
  });
}

export function useGenerateClientAuditReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Couldn't generate the report. Try again in a moment.");
        throw new Error('NO_SESSION');
      }

      let response: Response;
      try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/generate-client-audit-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ audit_id: auditId }),
        });
      } catch {
        toast.error("Couldn't generate the report. Try again in a moment.");
        throw new Error('NETWORK');
      }

      let body: any = {};
      try { body = await response.json(); } catch { /* empty body */ }

      if (response.status === 200) {
        const pages = body?.pages;
        toast.success(pages ? `Report generated (${pages} pages)` : 'Report generated');
        if (body?.download_url) {
          try { window.open(body.download_url, '_blank', 'noopener'); } catch { /* popup blocked */ }
        }
        return body;
      }

      if (response.status === 403) {
        toast.error(body?.error || "You don't have access to this audit.");
        throw new Error('FORBIDDEN');
      }

      // 401, 500, network, other
      toast.error("Couldn't generate the report. Try again in a moment.");
      throw new Error(`HTTP_${response.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-details', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audits'] });
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

export function useGenerateClientAuditReportDocx(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Couldn't generate the Word document. Try again in a moment.");
        throw new Error('NO_SESSION');
      }

      let response: Response;
      try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/generate-client-audit-report-docx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ audit_id: auditId }),
        });
      } catch {
        toast.error("Couldn't generate the Word document. Try again in a moment.");
        throw new Error('NETWORK');
      }

      let body: any = {};
      try { body = await response.json(); } catch { /* empty body */ }

      if (response.status === 200) {
        toast.success('Word document generated');
        if (body?.download_url) {
          try { window.open(body.download_url, '_blank', 'noopener'); } catch { /* popup blocked */ }
        }
        return body;
      }

      if (response.status === 403) {
        toast.error(body?.error || "You don't have access to this audit.");
        throw new Error('FORBIDDEN');
      }

      toast.error(body?.error || "Couldn't generate the Word document. Try again in a moment.");
      throw new Error(`HTTP_${response.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-details', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audits'] });
    },
  });
}
