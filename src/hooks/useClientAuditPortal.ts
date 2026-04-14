import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AuditActionPlanItem } from '@/types/auditWorkspace';

export interface ClientAuditReport {
  id: string;
  title: string;
  audit_type: string;
  conducted_at: string | null;
  risk_rating: string | null;
  score_pct: number | null;
  report_released_at: string | null;
  report_released_by: string | null;
  report_release_notes: string | null;
  report_acknowledged_at: string | null;
  report_acknowledged_by: string | null;
  report_pdf_path: string | null;
  executive_summary: string | null;
  overall_finding: string | null;
  lead_auditor_id: string | null;
  snapshot_rto_name: string | null;
  subject_tenant_id: number;
}

export function useClientAuditReports(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ['client-audit-reports', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('client_audits' as any)
        .select('id, title, audit_type, conducted_at, risk_rating, score_pct, report_released_at, report_released_by, report_release_notes, report_acknowledged_at, report_acknowledged_by, report_pdf_path, executive_summary, overall_finding, lead_auditor_id, snapshot_rto_name, subject_tenant_id') as any)
        .eq('subject_tenant_id', tenantId)
        .eq('report_client_visible', true)
        .order('report_released_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClientAuditReport[];
    },
  });
}

export function useClientActionPlanEnhanced(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ['client-action-plan-enhanced', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('v_audit_action_plan' as any)
        .select('*') as any)
        .eq('subject_tenant_id', tenantId)
        .eq('report_client_visible', true)
        .neq('status', 'cancelled')
        .order('priority', { ascending: true })
        .order('effective_due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AuditActionPlanItem[];
    },
  });
}
