import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useClientPreview } from '@/contexts/ClientPreviewContext';

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
  const { isPreviewMode, actingUserId } = useClientPreview();
  // Impersonation never swaps the real Supabase auth session — it only sets
  // actingUserId in ClientPreviewContext. Reading tickets against the real
  // staff user.id here would surface the staff member's own internal
  // tickets instead of the impersonated client's. Never fall back to the
  // staff id while in preview mode with no acting user resolved.
  const effectiveUserId = isPreviewMode ? actingUserId : user?.id ?? null;
  return useQuery({
    queryKey: ['client-support-tickets', effectiveUserId],
    enabled: !!effectiveUserId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTicketRow[]> => {
      const { data, error } = await supabase
        .from('suggest_items')
        .select(SELECT)
        .eq('is_deleted', false)
        .eq('reported_by', effectiveUserId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ClientTicketRow[];
    },
  });
}

export function useClientSupportTicket(id: string | undefined) {
  const { user } = useAuth();
  const { isPreviewMode, actingUserId } = useClientPreview();
  const effectiveUserId = isPreviewMode ? actingUserId : user?.id ?? null;
  return useQuery({
    queryKey: ['client-support-ticket', id, effectiveUserId],
    enabled: !!id && !!effectiveUserId,
    queryFn: async (): Promise<ClientTicketRow | null> => {
      const { data, error } = await supabase
        .from('suggest_items')
        .select(SELECT)
        .eq('id', id!)
        .eq('is_deleted', false)
        .eq('reported_by', effectiveUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClientTicketRow) ?? null;
    },
  });
}
