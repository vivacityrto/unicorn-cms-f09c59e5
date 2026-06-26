import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ClientTicketRow {
  id: string;
  title: string;
  description: string | null;
  urgency: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
  trying_to_do: string | null;
  what_happened: string | null;
  error_message: string | null;
  feature_context: string | null;
  improvement_context: string | null;
  resolution_notes: string | null;
  item_type: { id: string; code: string; label: string } | null;
  status: { id: string; code: string; label: string } | null;
  priority: { id: string; code: string; label: string } | null;
}

const SELECT = `
  id, title, description, urgency, created_at, updated_at, resolved_at,
  trying_to_do, what_happened, error_message, feature_context, improvement_context,
  resolution_notes,
  item_type:dd_suggest_item_type!suggest_items_suggest_item_type_id_fkey(id, code, label),
  status:dd_suggest_status!suggest_items_suggest_status_id_fkey(id, code, label),
  priority:dd_suggest_priority!suggest_items_suggest_priority_id_fkey(id, code, label)
`;

export function useClientSupportTickets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['client-support-tickets', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTicketRow[]> => {
      const { data, error } = await supabase
        .from('suggest_items')
        .select(SELECT)
        .eq('is_deleted', false)
        .eq('reported_by', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ClientTicketRow[];
    },
  });
}

export function useClientSupportTicket(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['client-support-ticket', id, user?.id],
    enabled: !!id && !!user?.id,
    queryFn: async (): Promise<ClientTicketRow | null> => {
      const { data, error } = await supabase
        .from('suggest_items')
        .select(SELECT)
        .eq('id', id!)
        .eq('is_deleted', false)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClientTicketRow) ?? null;
    },
  });
}
