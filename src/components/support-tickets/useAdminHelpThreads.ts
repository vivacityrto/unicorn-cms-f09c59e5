import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type SupportUser = Pick<Tables<'users'>, 'user_uuid' | 'full_name' | 'email'>;
type HelpMessage = Pick<Tables<'help_messages'>, 'thread_id' | 'role' | 'content' | 'created_at'>;
type HelpThreadQueryRow = Pick<Tables<'help_threads'>, 'id' | 'tenant_id' | 'user_id' | 'subject' | 'status' | 'created_at' | 'updated_at'> & {
  tenant: { id: number; name: string | null; rto_name: string | null } | null;
};

export interface AdminHelpThreadRow {
  id: string;
  subject: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  tenant: { id: number; name: string | null; rto_name: string | null } | null;
  reporter: { user_uuid: string; full_name: string | null; email: string | null } | null;
  unanswered: boolean;
  message_count: number;
  last_message_at: string | null;
  last_message_role: string | null;
  first_user_message: string | null;
}

export function useAdminHelpThreads() {
  return useQuery({
    queryKey: ['admin-help-threads'],
    queryFn: async (): Promise<AdminHelpThreadRow[]> => {
      const { data: threads, error } = await supabase
        .from('help_threads')
        .select(`
          id, tenant_id, user_id, subject, status, created_at, updated_at,
          tenant:tenants!help_threads_tenant_id_fkey(id, name, rto_name)
        `)
        .eq('channel', 'support')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const list = (threads ?? []) as unknown as HelpThreadQueryRow[];
      if (list.length === 0) return [];

      const userIds = Array.from(
        new Set(list.map((t) => t.user_id).filter((v): v is string => !!v)),
      );

      const [{ data: users }, { data: messages }] = await Promise.all([
        userIds.length
          ? supabase
              .from('users')
              .select('user_uuid, full_name, email')
              .in('user_uuid', userIds)
          : Promise.resolve({ data: [] as SupportUser[] }),
        supabase
          .from('help_messages')
          .select('thread_id, role, content, created_at')
          .in('thread_id', list.map((t) => t.id))
          .order('created_at', { ascending: true }),
      ]);

      const userMap = new Map<string, { user_uuid: string; full_name: string | null; email: string | null }>();
      (users ?? []).forEach((u: SupportUser) => userMap.set(u.user_uuid, u));

      const msgsByThread = new Map<string, HelpMessage[]>();
      (messages ?? []).forEach((m: HelpMessage) => {
        const arr = msgsByThread.get(m.thread_id) ?? [];
        arr.push(m);
        msgsByThread.set(m.thread_id, arr);
      });

      return list.map((t) => {
        const msgs = msgsByThread.get(t.id) ?? [];
        const hasStaff = msgs.some((m) => m.role === 'staff');
        const last = msgs[msgs.length - 1];
        const firstUser = msgs.find((m) => m.role === 'user');
        return {
          id: t.id,
          subject: t.subject ?? null,
          status: t.status ?? null,
          created_at: t.created_at,
          updated_at: t.updated_at,
          tenant: t.tenant ?? null,
          reporter: t.user_id ? userMap.get(t.user_id) ?? null : null,
          unanswered: !hasStaff,
          message_count: msgs.length,
          last_message_at: last?.created_at ?? null,
          last_message_role: last?.role ?? null,
          first_user_message: firstUser?.content ?? null,
        };
      });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
