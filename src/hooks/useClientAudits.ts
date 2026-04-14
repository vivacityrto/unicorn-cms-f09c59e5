import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { AuditDashboardRow, ClientAudit, AuditType } from '@/types/clientAudits';

export function useAuditsDashboard() {
  return useQuery({
    queryKey: ['client-audits-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_client_audits_dashboard' as any)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AuditDashboardRow[];
    },
  });
}

export function useClientAudits(tenantId: number | undefined) {
  return useQuery({
    queryKey: ['client-audits', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_client_audits_dashboard' as any)
        .select('*')
        .eq('subject_tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AuditDashboardRow[];
    },
  });
}

export function useAudit(auditId: string | undefined) {
  return useQuery({
    queryKey: ['client-audit', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audits' as any)
        .select('*')
        .eq('id', auditId)
        .single();
      if (error) throw error;
      return data as unknown as ClientAudit;
    },
  });
}

const AUDIT_TYPE_HUMAN: Record<AuditType, string> = {
  compliance_health_check: 'Compliance Health Check',
  mock_audit: 'Mock Audit',
  due_diligence: 'Due Diligence',
};

interface CreateAuditInput {
  audit_type: AuditType;
  subject_tenant_id: number;
  client_name: string;
  title?: string;
  conducted_at?: string;
  lead_auditor_id?: string;
  assisted_by_id?: string;
  training_products?: string[];
  doc_number?: string;
  snapshot_rto_name?: string;
  snapshot_rto_number?: string;
  snapshot_cricos_code?: string;
  snapshot_site_address?: string;
  snapshot_ceo?: string;
  snapshot_phone?: string;
  snapshot_email?: string;
  snapshot_website?: string;
  snapshot_other_contacts?: string;
}

export function useCreateAudit() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateAuditInput) => {
      const year = new Date().getFullYear();
      const title = input.title?.trim() || `${AUDIT_TYPE_HUMAN[input.audit_type]} — ${input.client_name} — ${year}`;
      const userId = session?.user?.id;

      const { data, error } = await supabase
        .from('client_audits' as any)
        .insert({
          audit_type: input.audit_type,
          subject_tenant_id: input.subject_tenant_id,
          title,
          status: 'draft',
          conducted_at: input.conducted_at || null,
          lead_auditor_id: input.lead_auditor_id || null,
          assisted_by_id: input.assisted_by_id || null,
          training_products: input.training_products || [],
          doc_number: input.doc_number || null,
          snapshot_rto_name: input.snapshot_rto_name || null,
          snapshot_rto_number: input.snapshot_rto_number || null,
          snapshot_cricos_code: input.snapshot_cricos_code || null,
          snapshot_site_address: input.snapshot_site_address || null,
          snapshot_ceo: input.snapshot_ceo || null,
          snapshot_phone: input.snapshot_phone || null,
          snapshot_email: input.snapshot_email || null,
          snapshot_website: input.snapshot_website || null,
          snapshot_other_contacts: input.snapshot_other_contacts || null,
          ai_analysis_status: 'none',
          created_by: userId,
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      // Insert timeline event
      try {
        await supabase.from('client_timeline_events' as any).insert({
          tenant_id: input.subject_tenant_id,
          event_type: 'audit_created',
          title: `Audit started: ${title}`,
          entity_type: 'client_audit',
          entity_id: (data as any).id,
          source: 'internal',
        } as any);
      } catch {
        // Non-critical — don't fail the audit creation
      }

      return data as unknown as { id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-audits-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['client-audits'] });
      toast.success('Audit created successfully');
      navigate(`/audits/${data.id}`);
    },
    onError: (err: any) => {
      toast.error('Failed to create audit: ' + (err.message || 'Unknown error'));
    },
  });
}

export function useOverdueActionCount() {
  return useQuery({
    queryKey: ['audit-overdue-actions'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count, error } = await supabase
        .from('client_audit_actions' as any)
        .select('*', { count: 'exact', head: true })
        .neq('status', 'complete')
        .lt('due_date', today);
      if (error) throw error;
      return count || 0;
    },
  });
}
