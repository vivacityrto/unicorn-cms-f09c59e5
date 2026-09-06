import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminHelpMessageRow {
  id: string;
  thread_id: string;
  sender_id: string | null;
  role: string;
  content: string;
  created_at: string;
  metadata: unknown;
  sender_name?: string | null;
}

export function useAdminHelpThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: ['admin-help-thread-messages', threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<AdminHelpMessageRow[]> => {
      const { data, error } = await supabase
        .from('help_messages')
        .select('id, thread_id, sender_id, role, content, created_at, metadata')
        .eq('thread_id', threadId as string)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const rows = data ?? [];

      const senderIds = Array.from(
        new Set(rows.map((r) => r.sender_id).filter((v): v is string => !!v)),
      );
      const nameMap = new Map<string, string | null>();
      if (senderIds.length) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, full_name, email')
          .in('user_uuid', senderIds);
        (users ?? []).forEach((u) =>
          nameMap.set(u.user_uuid, u.full_name || u.email || null),
        );
      }

      return rows.map((r) => ({
        ...r,
        sender_name: r.sender_id ? nameMap.get(r.sender_id) ?? null : null,
      }));
    },
    staleTime: 15_000,
  });
}
