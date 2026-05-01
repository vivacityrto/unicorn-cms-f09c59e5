import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AuditType, AuditRisk } from '@/types/clientAudits';

export interface ReleasedAuditRow {
  id: string;
  audit_type: AuditType;
  snapshot_rto_name: string | null;
  snapshot_rto_number: string | null;
  snapshot_cricos_code: string | null;
  conducted_at: string | null;
  score_pct: number | null;
  score_total: number | null;
  score_max: number | null;
  risk_rating: AuditRisk | null;
  report_pdf_path: string | null;
  report_released_at: string | null;
  report_release_notes: string | null;
  report_acknowledged_at: string | null;
}

/**
 * Returns released audit reports visible to the current client tenant.
 * RLS (tenant_read_v2) gates rows: report_client_visible = true AND
 * report_released_at IS NOT NULL AND user belongs to the audit's tenant.
 */
export function useReleasedAudits() {
  return useQuery({
    queryKey: ['client-released-audits'],
    queryFn: async (): Promise<ReleasedAuditRow[]> => {
      const { data, error } = await (supabase as any)
        .from('client_audits')
        .select(
          `id, audit_type, snapshot_rto_name, snapshot_rto_number,
           snapshot_cricos_code, conducted_at, score_pct, score_total,
           score_max, risk_rating, report_pdf_path, report_released_at,
           report_release_notes, report_acknowledged_at`
        )
        .order('report_released_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ReleasedAuditRow[];
    },
    staleTime: 60_000,
  });
}
