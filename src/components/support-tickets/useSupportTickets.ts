import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { personName, type TicketRow, type TicketStatus, type TicketType, type TicketUrgency, type TicketProduct } from './ticketLogic';

/** Staff-side ticket queries. RLS lets staff read every non-private ticket row; the reporter joins need that. */
const SELECT = `
  id, ticket_number, product, tenant_id, reporter_id, type, status, urgency, title, assignee_id,
  source_url, external_ref, ai_state, created_at, updated_at, resolved_at, last_activity_at, deleted_at,
  tenant:tenants!support_tickets_tenant_id_fkey(id, name),
  reporter:users!support_tickets_reporter_id_fkey(user_uuid, first_name, last_name),
  assignee:users!support_tickets_assignee_id_fkey(user_uuid, first_name, last_name)
`;

export const SUPPORT_TICKETS_KEY = ['support-tickets'] as const;
export const supportTicketKey = (id: string | undefined) => ['support-ticket', id] as const;

export function useSupportTickets() {
  return useQuery({
    queryKey: SUPPORT_TICKETS_KEY,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TicketRow[]> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(SELECT)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TicketRow[];
    },
  });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: supportTicketKey(id),
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<TicketRow | null> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(SELECT)
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TicketRow | null) ?? null;
    },
  });
}

export type TicketPatch = Partial<{
  status: TicketStatus;
  urgency: TicketUrgency;
  type: TicketType;
  product: TicketProduct;
  assignee_id: string | null;
  title: string;
}>;

/**
 * Update one or more staff-editable ticket fields. The list and panel update
 * immediately and roll back if the write is refused. The database writes the
 * thread event and notifications; nothing else is written from the browser.
 */
export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TicketPatch }) => {
      const { error } = await supabase.from('support_tickets').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: SUPPORT_TICKETS_KEY });
      const prevList = qc.getQueryData<TicketRow[]>(SUPPORT_TICKETS_KEY);
      const prevOne = qc.getQueryData<TicketRow | null>(supportTicketKey(id));
      const apply = (t: TicketRow): TicketRow =>
        t.id === id ? { ...t, ...patch, ...(patch.assignee_id === null ? { assignee: null } : {}) } as TicketRow : t;
      if (prevList) qc.setQueryData(SUPPORT_TICKETS_KEY, prevList.map(apply));
      if (prevOne) qc.setQueryData(supportTicketKey(id), apply(prevOne));
      return { prevList, prevOne, id };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevList) qc.setQueryData(SUPPORT_TICKETS_KEY, ctx.prevList);
      if (ctx?.prevOne !== undefined) qc.setQueryData(supportTicketKey(ctx.id), ctx.prevOne);
      toast.error(err instanceof Error ? err.message : 'Could not update the ticket');
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY });
      qc.invalidateQueries({ queryKey: supportTicketKey(vars.id) });
      qc.invalidateQueries({ queryKey: ['support-ticket-thread', vars.id] });
    },
  });
}

/** Staff who can be assigned tickets, sorted by name. */
export function useStaffOptions() {
  const { data = [] } = useVivacityTeamUsers();
  return data
    .map((u) => ({ id: u.user_uuid, name: personName(u) || u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
