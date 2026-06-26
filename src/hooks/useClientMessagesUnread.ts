import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Count unread client messages for the staff member viewing a tenant.
 * Unread = a conversation whose latest message is from sender_type='client'
 * and was created after the staff member's last_read_at (or never read).
 */
export function useClientMessagesUnread(tenantId: number | null | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setCount(0);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setCount(0);
      return;
    }

    // Load all conversations for the tenant
    const { data: convos } = await (supabase as any)
      .from('tenant_conversations')
      .select('id')
      .eq('tenant_id', tenantId);
    const ids = (convos ?? []).map((c: any) => c.id as string);
    if (ids.length === 0) {
      setCount(0);
      return;
    }

    // Latest message per conversation
    const { data: msgs } = await (supabase as any)
      .from('tenant_messages')
      .select('conversation_id, sender_type, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false });
    const latest = new Map<string, { sender_type: string; created_at: string }>();
    (msgs ?? []).forEach((m: any) => {
      if (!latest.has(m.conversation_id)) {
        latest.set(m.conversation_id, { sender_type: m.sender_type, created_at: m.created_at });
      }
    });

    // Participant read state for this staff user
    const { data: parts } = await (supabase as any)
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)
      .in('conversation_id', ids);
    const readMap = new Map<string, string | null>();
    (parts ?? []).forEach((p: any) => readMap.set(p.conversation_id, p.last_read_at));

    let unread = 0;
    for (const cid of ids) {
      const last = latest.get(cid);
      if (!last || last.sender_type !== 'client') continue;
      const lastRead = readMap.get(cid);
      if (!lastRead || new Date(last.created_at) > new Date(lastRead)) {
        unread++;
      }
    }
    setCount(unread);
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`tenant-messages-unread:${tenantId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'tenant_messages', filter: `tenant_id=eq.${tenantId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, refresh]);

  return { count, refresh };
}
