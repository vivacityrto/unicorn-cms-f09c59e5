import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { buildStaffThreads, type StaffConversationRow, type StaffScopeRow } from '@/components/messenger/adapters/staffThreads';
import type { MessengerThread } from '@/components/messenger';

type RpcCall = (name: string) => Promise<{ data: unknown; error: unknown }>;

const REFRESH_MS = 20_000;
const CONVERSATION_LIMIT = 300;

/**
 * Which client organisations are mine, by the same routing that decides who is notified of a client message.
 * The answer is for one person, so it is kept under that person's id: signing out and in as someone else never reuses it.
 */
export function useStaffMessageScope(me: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['staff-messenger', 'scope', me],
    enabled: enabled && !!me,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<StaffScopeRow[]> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as RpcCall;
      const { data, error } = await rpc('get_my_message_scope');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as StaffScopeRow[];
    },
  });
}

/**
 * The staff bubble's threads. By default only conversations of organisations that are mine (I am their consultant, I cover
 * for them, I watch them, or I am a Super Admin and they have no consultant); "All clients" adds everyone else's.
 * Unread comes from the message notifications I was sent, so a colleague's client I cover shows as unread exactly when the
 * bell says so. It refreshes every 20 seconds.
 */
export function useStaffMessenger(allClients: boolean, enabled: boolean) {
  const { profile } = useAuth();
  const me = profile?.user_uuid ?? null;
  const scopeQuery = useStaffMessageScope(me, enabled);
  const scopeRows = scopeQuery.data;
  const scope = new Map((scopeRows ?? []).map((r) => [r.tenant_id, r]));
  const scopeKey = (scopeRows ?? []).map((r) => r.tenant_id).sort((a, b) => a - b).join(',');

  const query = useQuery({
    queryKey: ['staff-messenger', 'threads', me, allClients, scopeKey],
    enabled: enabled && !!me && scopeQuery.isSuccess,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<{ threads: MessengerThread[]; totalUnread: number; tenants: Array<{ id: number; name: string }> }> => {
      const tenantIds = (scopeRows ?? []).map((r) => r.tenant_id);
      let q = supabase
        .from('tenant_conversations')
        .select('id, tenant_id, subject, topic, type, last_message_at, last_message_preview, created_at')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(CONVERSATION_LIMIT);
      if (!allClients) {
        if (tenantIds.length === 0) return { threads: [], totalUnread: 0, tenants: [] };
        q = q.in('tenant_id', tenantIds);
      }
      const { data: convos, error } = await q;
      if (error) throw error;
      const rows = (convos ?? []) as StaffConversationRow[];

      const orgIds = Array.from(new Set(rows.map((c) => c.tenant_id)));
      const convIds = rows.map((c) => c.id);
      const [tenantsRes, notesRes, partRes] = await Promise.all([
        orgIds.length ? supabase.from('tenants').select('id, name').in('id', orgIds) : Promise.resolve({ data: [] as Array<{ id: number; name: string | null }> }),
        supabase.from('user_notifications').select('source_id').eq('user_id', me!).eq('type', 'message').eq('is_read', false).limit(500),
        convIds.length ? supabase.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', me!).in('conversation_id', convIds) : Promise.resolve({ data: [] as Array<{ conversation_id: string; last_read_at: string | null }> }),
      ]);

      const tenantNames = new Map((tenantsRes.data ?? []).map((t) => [t.id, t.name ?? `Client ${t.id}`]));
      const unreadIds = new Set((notesRes.data ?? []).map((n) => n.source_id).filter((id): id is string => !!id));
      const myReadAt = new Map((partRes.data ?? []).map((p) => [p.conversation_id, p.last_read_at]));
      const threads = buildStaffThreads({ conversations: rows, scope, tenantNames, unreadConversationIds: unreadIds, myReadAt });
      const tenants = Array.from(tenantNames, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
      return { threads, totalUnread: threads.filter((t) => t.unread).length, tenants };
    },
  });

  return {
    threads: query.data?.threads ?? [],
    totalUnread: query.data?.totalUnread ?? 0,
    /** The organisations that have a conversation in this view, by name, for a client picker. */
    tenants: query.data?.tenants ?? [],
    isLoading: scopeQuery.isLoading || query.isLoading,
    scope,
    hasScope: (scopeRows ?? []).length > 0,
  };
}
