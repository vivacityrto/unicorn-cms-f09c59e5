import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BulkMessageSummary {
  /** Bulk messages waiting to go out. */
  scheduled: number;
  /** When the most recent one was sent, if any. */
  lastSentAt: string | null;
}

/** The bulk message card on Team Communications: how many are scheduled and when one last went out. */
export function useBulkMessageSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['bulk-message-summary'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<BulkMessageSummary> => {
      const { data, error } = await supabase
        .from('broadcast_campaigns')
        .select('status, sent_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = data ?? [];
      const sent = rows.map((r) => r.sent_at).filter((d): d is string => !!d).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return { scheduled: rows.filter((r) => r.status === 'scheduled').length, lastSentAt: sent[0] ?? null };
    },
  });
}
