import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { buildStaffThreads, type StaffConversationRow, type StaffScopeRow } from '@/components/messenger/adapters/staffThreads';
import type { MessengerThread } from '@/components/messenger';

type RpcCall = (name: string) => Promise<{ data: unknown; error: unknown }>;

const REFRESH_MS = 20_000;
const CONVERSATION_LIMIT = 300;
const CONVERSATION_COLUMNS = 'id, tenant_id, subject, topic, type, last_message_at, last_message_preview, created_at';

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
export function useStaffMessenger(allClients: boolean, enabled: boolean, opts: { tenantId?: number | null; extraThreadId?: string | null; memberId?: string | null } = {}) {
  const { tenantId: onlyTenant = null, extraThreadId = null, memberId = null } = opts;
  const { profile } = useAuth();
  const me = profile?.user_uuid ?? null;
  const scopeQuery = useStaffMessageScope(me, enabled);
  const scopeRows = scopeQuery.data;
  const scope = new Map((scopeRows ?? []).map((r) => [r.tenant_id, r]));
  const scopeKey = (scopeRows ?? []).map((r) => r.tenant_id).sort((a, b) => a - b).join(',');

  const query = useQuery({
    queryKey: ['staff-messenger', 'threads', me, allClients, scopeKey, onlyTenant, memberId],
    enabled: enabled && !!me && scopeQuery.isSuccess,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<{ threads: MessengerThread[]; totalUnread: number; limited: boolean; participating: string[] }> => {
      const tenantIds = (scopeRows ?? []).map((r) => r.tenant_id);
      let rows: StaffConversationRow[];
      // Conversations I am a participant in (I started or replied in them), whichever client they are with. Filled in below.
      let participating: string[] = [];

      if (memberId) {
        // A team member's conversations: their clients (they are the primary consultant) plus any conversation they have taken
        // part in. Worked out on the server, so it is complete (not limited to what is already on the page) and it ignores
        // "My clients", because the point is to look at that person's work.
        const [partRes, cscRes] = await Promise.all([
          supabase
            .from('tenant_conversations')
            .select(`${CONVERSATION_COLUMNS}, conversation_participants!inner(user_id)`)
            .eq('conversation_participants.user_id', memberId)
            .match(onlyTenant != null ? { tenant_id: onlyTenant } : {})
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(CONVERSATION_LIMIT),
          supabase.from('tenant_csc_assignments').select('tenant_id').eq('csc_user_id', memberId).is('ended_at', null).is('superseded_at', null),
        ]);
        if (partRes.error) throw partRes.error;
        if (cscRes.error) throw cscRes.error;
        // When one client is chosen as well, only that client counts: asked of the database before the cap, so a client's older
        // conversations are not cut off by the newest 300 of everything else.
        const theirTenants = Array.from(new Set((cscRes.data ?? []).map((a) => a.tenant_id))).filter((id) => onlyTenant == null || id === onlyTenant);
        const ofTheirClients = theirTenants.length
          ? await supabase
              .from('tenant_conversations')
              .select(CONVERSATION_COLUMNS)
              .in('tenant_id', theirTenants)
              .order('last_message_at', { ascending: false, nullsFirst: false })
              .limit(CONVERSATION_LIMIT)
          : { data: [] as unknown[], error: null };
        if (ofTheirClients.error) throw ofTheirClients.error;
        const merged = new Map<string, StaffConversationRow>();
        for (const c of [...((partRes.data ?? []) as unknown as StaffConversationRow[]), ...((ofTheirClients.data ?? []) as unknown as StaffConversationRow[])]) {
          merged.set(c.id, {
            id: c.id, tenant_id: c.tenant_id, subject: c.subject, topic: c.topic, type: c.type,
            last_message_at: c.last_message_at, last_message_preview: c.last_message_preview, created_at: c.created_at,
          });
        }
        rows = Array.from(merged.values())
          .filter((c) => onlyTenant == null || c.tenant_id === onlyTenant)
          .sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime())
          .slice(0, CONVERSATION_LIMIT);
      } else {
        let q = supabase
          .from('tenant_conversations')
          .select(CONVERSATION_COLUMNS)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(CONVERSATION_LIMIT);
        if (!allClients && tenantIds.length > 0) q = q.in('tenant_id', tenantIds);
        // One client's conversations are listed in full (up to the limit for that client), so older ones are reachable.
        if (onlyTenant != null) q = q.eq('tenant_id', onlyTenant);

        // My clients also includes any conversation I am in, whoever the client is: a message I send to a client who is not
        // one of mine would otherwise vanish from my own list the moment it was sent.
        const partQuery = !allClients
          ? supabase
              .from('tenant_conversations')
              .select(`${CONVERSATION_COLUMNS}, conversation_participants!inner(user_id)`)
              .eq('conversation_participants.user_id', me!)
              .match(onlyTenant != null ? { tenant_id: onlyTenant } : {})
              .order('last_message_at', { ascending: false, nullsFirst: false })
              .limit(CONVERSATION_LIMIT)
          : null;
        const [main, part] = await Promise.all([
          !allClients && tenantIds.length === 0 ? Promise.resolve({ data: [] as unknown[], error: null }) : q,
          partQuery ?? Promise.resolve({ data: [] as unknown[], error: null }),
        ]);
        if (main.error) throw main.error;
        if (part.error) throw part.error;
        const mainRows = (main.data ?? []) as StaffConversationRow[];
        const partRows = (part.data ?? []) as unknown as StaffConversationRow[];
        participating = partRows.map((c) => c.id);
        const merged = new Map<string, StaffConversationRow>();
        for (const c of [...mainRows, ...partRows]) {
          merged.set(c.id, {
            id: c.id, tenant_id: c.tenant_id, subject: c.subject, topic: c.topic, type: c.type,
            last_message_at: c.last_message_at, last_message_preview: c.last_message_preview, created_at: c.created_at,
          });
        }
        rows = Array.from(merged.values())
          .sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime())
          .slice(0, CONVERSATION_LIMIT);
        if (rows.length === 0) return { threads: [], totalUnread: 0, limited: false, participating };
      }

      const orgIds = Array.from(new Set(rows.map((c) => c.tenant_id)));
      const convIds = rows.map((c) => c.id);
      const [tenantsRes, notesRes, partRes] = await Promise.all([
        orgIds.length ? supabase.from('tenants').select('id, name').in('id', orgIds) : Promise.resolve({ data: [] as Array<{ id: number; name: string | null }> }),
        supabase.from('user_notifications').select('source_id, created_at').eq('user_id', me!).eq('type', 'message').eq('is_read', false).limit(500),
        convIds.length ? supabase.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', me!).in('conversation_id', convIds) : Promise.resolve({ data: [] as Array<{ conversation_id: string; last_read_at: string | null }> }),
      ]);

      const tenantNames = new Map((tenantsRes.data ?? []).map((t) => [t.id, t.name ?? `Client ${t.id}`]));
      const unreadIds = new Set((notesRes.data ?? []).map((n) => n.source_id).filter((id): id is string => !!id));
      const unreadSince = new Map<string, string>();
      for (const n of notesRes.data ?? []) {
        if (!n.source_id || !n.created_at) continue;
        const seen = unreadSince.get(n.source_id);
        if (!seen || new Date(n.created_at) < new Date(seen)) unreadSince.set(n.source_id, n.created_at);
      }
      const myReadAt = new Map((partRes.data ?? []).map((p) => [p.conversation_id, p.last_read_at]));
      const threads = buildStaffThreads({ conversations: rows, scope, tenantNames, unreadConversationIds: unreadIds, myReadAt, unreadSince });
      return { threads, totalUnread: threads.filter((t) => t.unread).length, limited: rows.length >= CONVERSATION_LIMIT, participating };
    },
  });

  // The client picker lists every client in this view, not only the ones in the newest conversations.
  const tenantsQuery = useQuery({
    queryKey: ['staff-messenger', 'tenants', me, allClients, scopeKey, memberId],
    enabled: enabled && !!me && scopeQuery.isSuccess,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<{ id: number; name: string }>> => {
      let q = supabase.from('tenants').select('id, name').eq('status', 'active').neq('id', 6372).order('name');
      // Looking at a team member's work is not limited to my clients, so neither is the picker.
      if (!allClients && !memberId) {
        const ids = (scopeRows ?? []).map((r) => r.tenant_id);
        if (ids.length === 0) return [];
        q = q.in('id', ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id, name: t.name ?? `Client ${t.id}` }));
    },
  });

  // A conversation opened by link (or just created) that is not in the list above, for example an older one.
  const inList = !!extraThreadId && !!query.data?.threads.some((t) => t.id === extraThreadId);
  const extraQuery = useQuery({
    queryKey: ['staff-messenger', 'thread', me, extraThreadId],
    enabled: enabled && !!me && !!extraThreadId && query.isSuccess && !inList && scopeQuery.isSuccess,
    staleTime: 10_000,
    // Kept current while it is open: new messages and replies change its preview, its time and whether it is unread.
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<MessengerThread | null> => {
      const { data: c, error } = await supabase
        .from('tenant_conversations')
        .select('id, tenant_id, subject, topic, type, last_message_at, last_message_preview, created_at')
        .eq('id', extraThreadId as string)
        .maybeSingle();
      if (error) throw error;
      if (!c) return null;
      const row = c as StaffConversationRow;
      const [tenantRes, partRes, notesRes] = await Promise.all([
        supabase.from('tenants').select('id, name').eq('id', row.tenant_id).maybeSingle(),
        supabase.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', me!).eq('conversation_id', row.id),
        // The message notifications still unread for this conversation, so a conversation of mine outside the newest list
        // keeps its unread boundary and its "oldest waiting" time when it is opened by link.
        supabase.from('user_notifications').select('source_id, created_at').eq('user_id', me!).eq('type', 'message').eq('is_read', false).eq('source_id', row.id),
      ]);
      const unreadIds = new Set((notesRes.data ?? []).map((n) => n.source_id).filter((id): id is string => !!id));
      const unreadSince = new Map<string, string>();
      for (const n of notesRes.data ?? []) {
        if (!n.source_id || !n.created_at) continue;
        const seen = unreadSince.get(n.source_id);
        if (!seen || new Date(n.created_at) < new Date(seen)) unreadSince.set(n.source_id, n.created_at);
      }
      const names = new Map<number, string>([[row.tenant_id, tenantRes.data?.name ?? `Client ${row.tenant_id}`]]);
      const read = new Map((partRes.data ?? []).map((p) => [p.conversation_id, p.last_read_at]));
      return buildStaffThreads({ conversations: [row], scope, tenantNames: names, unreadConversationIds: unreadIds, myReadAt: read, unreadSince })[0] ?? null;
    },
  });

  const mainThreads = query.data?.threads ?? [];
  const extra = extraQuery.data ?? null;

  return {
    /** Exactly what the filters ask for. A conversation opened by link is NOT mixed in: see `opened`. */
    threads: mainThreads,
    /** The conversation asked for by id when it is not in `threads` (older, another client's, or outside a filter), to keep open. */
    opened: extra && !mainThreads.some((t) => t.id === extra.id) ? extra : null,
    totalUnread: query.data?.totalUnread ?? 0,
    /** Ids of the conversations I am a participant in. They are mine to read and answer even when the client is not one of mine. */
    participating: new Set(query.data?.participating ?? []),
    /** True when the list stopped at the newest conversations; pick a client to see all of theirs. */
    limited: query.data?.limited ?? false,
    /** Every client in this view, by name, for a client picker. */
    tenants: tenantsQuery.data ?? [],
    isLoading: scopeQuery.isLoading || query.isLoading,
    scope,
    hasScope: (scopeRows ?? []).length > 0,
  };
}
