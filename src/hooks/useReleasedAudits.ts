import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';
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
 *
 * SECURITY: Explicit tenant filter is required because staff bypass
 * tenant RLS via get_current_user_tenant_id(). Without this filter,
 * a staff member impersonating a client would see every released audit
 * across every tenant.
 */
export function useReleasedAudits() {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client-released-audits', activeTenantId],
    queryFn: async (): Promise<ReleasedAuditRow[]> => {
      if (!activeTenantId) return [];

      const { data, error } = await supabase
        .from('client_audits')
        .select(
          `id, audit_type, snapshot_rto_name, snapshot_rto_number,
           snapshot_cricos_code, conducted_at, score_pct, score_total,
           score_max, risk_rating, report_pdf_path, report_released_at,
           report_release_notes, report_acknowledged_at`
        )
        .eq('subject_tenant_id', activeTenantId)
        .eq('report_client_visible', true)
        .not('report_released_at', 'is', null)
        .order('report_released_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ReleasedAuditRow[];
    },
    enabled: !!activeTenantId,
    staleTime: 60_000,
  });
}
