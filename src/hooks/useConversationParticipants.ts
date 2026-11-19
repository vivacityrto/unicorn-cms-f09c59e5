import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { displayName, fetchSenderProfiles } from '@/lib/conversationSenders';
import { toPeople } from '@/components/messenger/adapters/tenantConversations';
import type { MessengerPerson } from '@/components/messenger/types';

/**
 * The people in one conversation and when each last read it, so "Seen" can show under your latest message.
 * Read positions are not pushed live, so the list refreshes every 20 seconds while the conversation is open.
 */
export function useConversationParticipants(conversationId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['conversation-participants', conversationId],
    enabled: !!conversationId && enabled,
    refetchInterval: 20_000,
    queryFn: async (): Promise<MessengerPerson[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase.from('conversation_participants').select('user_id, last_read_at').eq('conversation_id', conversationId);
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r) => r.user_id).filter((id): id is string => !!id);
      const profiles = ids.length ? await fetchSenderProfiles(conversationId, ids) : new Map();
      const names = new Map<string, { name: string; avatarUrl: string | null; isStaff: boolean | null }>();
      for (const [id, p] of profiles) names.set(id, { name: displayName(p, 'Someone'), avatarUrl: p.avatar_url, isStaff: p.is_staff });
      return toPeople(rows, names);
    },
  });
}
