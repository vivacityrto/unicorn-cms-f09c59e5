import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/** A person's per-client "watch" or "mute", which beats their category scope for that client. */

export type OverrideMode = 'watch' | 'mute';

export interface ClientOverride {
  tenantId: number;
  tenantName: string;
  mode: OverrideMode;
}

export interface TenantOption {
  id: number;
  name: string;
}

export function useClientNotificationOverrides() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const userId = profile?.user_uuid;

  const query = useQuery({
    queryKey: ['notification-overrides', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ClientOverride[]> => {
      const { data, error } = await supabase
        .from('notification_client_overrides')
        .select('tenant_id, mode')
        .eq('user_id', userId as string);
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r) => r.tenant_id);
      const { data: tenants } = ids.length
        ? await supabase.from('tenants').select('id, name').in('id', ids)
        : { data: [] as TenantOption[] };
      const names = new Map((tenants ?? []).map((t) => [t.id, t.name]));
      return rows
        .map((r) => ({
          tenantId: r.tenant_id,
          tenantName: names.get(r.tenant_id) ?? `Client ${r.tenant_id}`,
          mode: (r.mode === 'watch' ? 'watch' : 'mute') as OverrideMode,
        }))
        .sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notification-overrides'] });

  const set = useMutation({
    mutationFn: async ({ tenantId, mode }: { tenantId: number; mode: OverrideMode }) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase
        .from('notification_client_overrides')
        .upsert({ user_id: userId, tenant_id: tenantId, mode }, { onConflict: 'user_id,tenant_id' });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (tenantId: number) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase
        .from('notification_client_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: 'Could not remove', description: err.message, variant: 'destructive' }),
  });

  return { overrides: query.data ?? [], isLoading: query.isLoading, set, remove };
}

/** Find clients by name for the override picker. */
export function useTenantSearch(term: string) {
  const clean = term.replace(/[%_,()]/g, '').trim();
  return useQuery({
    queryKey: ['notification-tenant-search', clean],
    enabled: clean.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TenantOption[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .ilike('name', `%${clean}%`)
        .order('name', { ascending: true })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
}
