import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useClientPreview } from '@/contexts/ClientPreviewContext';
import type { TicketStatus, TicketType } from '@/components/support-tickets/ticketLogic';

export interface ClientTicketRow {
  id: string;
  ticket_number: number;
  title: string;
  type: TicketType;
  status: TicketStatus;
  created_at: string;
  last_activity_at: string;
  reporter_id: string;
}

const COLS = 'id, ticket_number, title, type, status, created_at, last_activity_at, reporter_id';

/**
 * The signed-in client's own tickets. The query filters by reporter itself and
 * RLS enforces the same rule, so neither layer is relied on alone.
 * In staff impersonation the real session stays the staff member's, so the
 * acting client's id is used and never the staff id.
 */
function useEffectiveUserId(): string | null {
  const { user } = useAuth();
  const { isPreviewMode, actingUserId } = useClientPreview();
  return isPreviewMode ? actingUserId : user?.id ?? null;
}

export function useClientTickets() {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: ['client-support-tickets', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTicketRow[]> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(COLS)
        .eq('reporter_id', userId as string)
        .eq('product', 'unicorn')
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientTicketRow[];
    },
  });
}

export function useClientTicket(id: string | undefined) {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: ['client-support-ticket', id, userId],
    enabled: !!id && !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<ClientTicketRow | null> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(COLS)
        .eq('id', id as string)
        .eq('reporter_id', userId as string)
        .eq('product', 'unicorn')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClientTicketRow | null) ?? null;
    },
  });
}
