import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { htmlToText } from '@/lib/sanitize';
import { getRegulatorySummarySections } from '@/features/regulatory-updates/summaryFormatting';
import { plainExcerpt } from '@/features/regulatory-updates/regulatoryView';

export interface HomeBroadcast {
  id: string;
  subject: string;
  /** Plain-text start of the message. */
  excerpt: string;
  sentAt: string | null;
  isUnread: boolean;
}

export interface HomeRegulatoryUpdate {
  id: string;
  regulator: string;
  impact: string | null;
  detectedAt: string | null;
  excerpt: string | null;
}

const EXCERPT_LENGTH = 180;

// Kept here so existing imports keep working; the implementation lives with the regulatory helpers.
export { plainExcerpt };

/**
 * The latest messages Vivacity broadcast to this organisation (conversations of type "broadcast"), newest first, with
 * the start of each message and whether this person has read it. Skipped for Academy-only users, who have no inbox.
 * The key sits under 'client-conversations' so the inbox's realtime invalidation of that prefix refreshes this card too.
 */
export function useClientHomeBroadcasts(limit = 3) {
  const { activeTenantId, isAcademyOnly } = useClientTenant();
  return useQuery({
    queryKey: ['client-conversations', 'home-broadcasts', activeTenantId, limit],
    enabled: !!activeTenantId && !isAcademyOnly,
    staleTime: 60_000,
    queryFn: async (): Promise<HomeBroadcast[]> => {
      if (!activeTenantId) return [];
      const { data: userData } = await supabase.auth.getUser();
      const me = userData.user?.id ?? null;

      const { data: convos, error } = await supabase
        .from('tenant_conversations')
        .select('id, subject, last_message_at, created_at')
        .eq('tenant_id', activeTenantId)
        .eq('type', 'broadcast')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      if (!convos?.length) return [];

      const ids = convos.map((c) => c.id);
      const [{ data: messages }, { data: reads }] = await Promise.all([
        supabase.from('tenant_messages').select('conversation_id, body, created_at').in('conversation_id', ids).order('created_at', { ascending: true }),
        me
          ? supabase.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', me).in('conversation_id', ids)
          : Promise.resolve({ data: [] as Array<{ conversation_id: string; last_read_at: string | null }> }),
      ]);

      const first = new Map<string, string>();
      (messages ?? []).forEach((m) => {
        if (!first.has(m.conversation_id)) first.set(m.conversation_id, m.body ?? '');
      });
      const readAt = new Map<string, string | null>();
      (reads ?? []).forEach((r) => readAt.set(r.conversation_id, r.last_read_at));

      return convos.map((c) => {
        const sentAt = c.last_message_at ?? c.created_at ?? null;
        const read = readAt.get(c.id) ?? null;
        return {
          id: c.id,
          subject: c.subject || 'Message from Vivacity',
          excerpt: htmlToText(first.get(c.id) ?? '', EXCERPT_LENGTH),
          sentAt,
          isUnread: !!sentAt && (!read || new Date(sentAt) > new Date(read)),
        };
      });
    },
  });
}

/** The latest regulator changes (the same events as the Regulatory Updates page), newest first. */
export function useClientHomeRegulatoryUpdates(limit = 3) {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: ['client-home-regulatory-updates', activeTenantId, limit],
    enabled: !!activeTenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HomeRegulatoryUpdate[]> => {
      const { data, error } = await supabase
        .from('regulator_change_events')
        .select('id, detected_at, impact_level, change_summary_md, regulator_watchlist(name)')
        .order('detected_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((e) => {
        const watch = e.regulator_watchlist as unknown as { name: string | null } | null;
        const sections = e.change_summary_md ? getRegulatorySummarySections(e.change_summary_md) : null;
        return {
          id: e.id,
          regulator: watch?.name || 'Regulator update',
          impact: e.impact_level,
          detectedAt: e.detected_at,
          excerpt: plainExcerpt(sections?.changeSummary ?? e.change_summary_md),
        };
      });
    },
  });
}
