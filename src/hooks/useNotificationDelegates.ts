import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Assistant ("delegate") links: an assistant hears about the clients of the person
 * they assist. A Super Admin manages anyone's links; a CSC manages only their own.
 * The database function enforces that, this hook only calls it.
 */

type DelegateRow = Tables<'staff_notification_delegates'>;

export interface StaffOption {
  userId: string;
  name: string;
  role: string | null;
}

export interface DelegateLink extends DelegateRow {
  delegateName: string;
  principalName: string;
  tenantName: string | null;
}

const fullName = (u: { first_name: string | null; last_name: string | null }): string =>
  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unnamed';

export function useNotificationDelegates() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const userId = profile?.user_uuid;

  /** Active internal staff who can be an assistant or be assisted. */
  const staffQuery = useQuery({
    queryKey: ['notification-staff-options'],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StaffOption[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, unicorn_role, is_vivacity_internal, archived, disabled, is_system_account')
        .eq('is_vivacity_internal', true);
      if (error) throw error;
      return (data ?? [])
        .filter((u) => !u.archived && !u.disabled && !u.is_system_account && u.unicorn_role !== 'System Account')
        .map((u) => ({ userId: u.user_uuid, name: fullName(u), role: u.unicorn_role }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const linksQuery = useQuery({
    queryKey: ['notification-delegates', userId],
    enabled: !!userId,
    queryFn: async (): Promise<DelegateLink[]> => {
      const { data, error } = await supabase
        .from('staff_notification_delegates')
        .select('*')
        .is('ended_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];

      const userIds = [
        ...new Set(rows.flatMap((r) => [r.delegate_user_id, r.principal_user_id]).filter((x): x is string => !!x)),
      ];
      const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter((x): x is number => x != null))];

      const [users, tenants] = await Promise.all([
        userIds.length
          ? supabase.from('users').select('user_uuid, first_name, last_name').in('user_uuid', userIds)
          : Promise.resolve({ data: [], error: null }),
        tenantIds.length
          ? supabase.from('tenants').select('id, name').in('id', tenantIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const names = new Map((users.data ?? []).map((u) => [u.user_uuid, fullName(u)]));
      const tenantNames = new Map((tenants.data ?? []).map((t) => [t.id, t.name]));

      return rows.map((r) => ({
        ...r,
        delegateName: names.get(r.delegate_user_id) ?? 'Unknown',
        principalName: r.principal_kind === 'all_csc' ? 'All CSCs' : names.get(r.principal_user_id ?? '') ?? 'Unknown',
        tenantName: r.tenant_id != null ? tenantNames.get(r.tenant_id) ?? `Client ${r.tenant_id}` : null,
      }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notification-delegates'] });

  const create = useMutation({
    mutationFn: async (input: { principalKind: 'user' | 'all_csc'; principalUserId: string | null; delegateUserId: string }) => {
      const { error } = await supabase.rpc('create_notification_delegate', {
        p_principal_kind: input.principalKind,
        p_principal_user_id: input.principalUserId,
        p_delegate_user_id: input.delegateUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Assistant added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not add the assistant', description: err.message, variant: 'destructive' });
    },
  });

  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('end_notification_delegate', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Assistant link ended' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not end the link', description: err.message, variant: 'destructive' });
    },
  });

  return {
    staff: staffQuery.data ?? [],
    links: linksQuery.data ?? [],
    isLoading: linksQuery.isLoading || staffQuery.isLoading,
    create,
    end,
  };
}
