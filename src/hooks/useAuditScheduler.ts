import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditScheduleRow {
  tenant_id: number;
  client_name: string;
  rto_id: string | null;
  client_risk_level: string | null;
  registration_end_date: string | null;
  last_audit_id: string | null;
  last_conducted_at: string | null;
  last_risk_rating: string | null;
  last_score_pct: number | null;
  next_due_date: string | null;
  days_until_due: number | null;
  active_audit_id: string | null;
  active_status: string | null;
  schedule_status: string;
}

type ScheduleFilter = 'all' | 'overdue' | 'due_soon' | 'never_audited';

export function useAuditSchedule(filter: ScheduleFilter = 'all') {
  return useQuery({
    queryKey: ['audit-schedule', filter],
    queryFn: async () => {
      let query = supabase
        .from('v_audit_schedule' as any)
        .select('*')
        .order('days_until_due', { ascending: true, nullsFirst: false });

      if (filter !== 'all') {
        if (filter === 'due_soon') {
          query = query.in('schedule_status', ['overdue', 'due_soon', 'never_audited']);
        } else {
          query = query.eq('schedule_status', filter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AuditScheduleRow[];
    },
  });
}

export function useClientAuditSchedule(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ['client-audit-schedule', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_audit_schedule' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AuditScheduleRow | null;
    },
  });
}
