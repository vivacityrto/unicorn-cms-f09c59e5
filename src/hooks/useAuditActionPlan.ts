import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClientActionItem {
  id: string;
  tenant_id: number;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  assignee_user_id: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  source: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

// ─── Sync audit actions to client items (RPC) ───
export function useSyncAuditActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (auditId: string) => {
      const { data, error } = await supabase
        .rpc('sync_audit_actions_to_client_items', { p_audit_id: auditId } as any);
      if (error) throw error;
      return (data as number) || 0;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['audit-actions'] });
      queryClient.invalidateQueries({ queryKey: ['client-action-plan'] });
      if (count > 0) {
        toast.success(`${count} corrective action${count > 1 ? 's' : ''} synced to client action plan`);
      }
    },
  });
}

// ─── Client portal: action plan ───
export function useClientActionPlan(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ['client-action-plan', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_action_items' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('source', 'audit')
        .neq('status', 'completed')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ClientActionItem[];
    },
  });
}

// ─── Complete a client action item ───
export function useCompleteClientAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .from('client_action_items' as any)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
        } as any)
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-action-plan'] });
      toast.success('Action marked as complete');
    },
  });
}
