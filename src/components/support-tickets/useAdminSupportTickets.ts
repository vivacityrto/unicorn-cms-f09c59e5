import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminTicketRow {
  id: string;
  title: string;
  description: string | null;
  urgency: string | null;
  created_at: string;
  updated_at: string;
  is_client_visible: boolean | null;
  assigned_to: string | null;
  resolved_at: string | null;
  tenant: { id: number; name: string | null; rto_name: string | null } | null;
  reporter: { user_uuid: string; full_name: string | null; email: string | null } | null;
  assignee: { user_uuid: string; full_name: string | null } | null;
  item_type: { id: string; code: string; label: string } | null;
  status: { id: string; code: string; label: string } | null;
  priority: { id: string; code: string; label: string } | null;
}

export function useAdminSupportTickets() {
  return useQuery({
    queryKey: ['admin-support-tickets'],
    queryFn: async (): Promise<AdminTicketRow[]> => {
      const { data, error } = await supabase
        .from('suggest_items')
        .select(`
          id, title, description, urgency, created_at, updated_at,
          is_client_visible, assigned_to, resolved_at,
          tenant:tenants!suggest_items_tenant_id_fkey(id, name, rto_name),
          reporter:users!suggest_items_reported_by_fkey(user_uuid, full_name, email),
          assignee:users!suggest_items_assigned_to_fkey(user_uuid, full_name),
          item_type:dd_suggest_item_type!suggest_items_suggest_item_type_id_fkey(id, code, label),
          status:dd_suggest_status!suggest_items_suggest_status_id_fkey(id, code, label),
          priority:dd_suggest_priority!suggest_items_suggest_priority_id_fkey(id, code, label)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as AdminTicketRow[];
    },
    staleTime: 30_000,
  });
}
