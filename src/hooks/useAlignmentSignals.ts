/**
 * useAlignmentSignals – Unicorn 2.0
 * Fetches alignment signals from v_exec_alignment_signals_7d for the Executive Dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AlignmentSignal {
  signal_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  tenant_id: number;
  package_instance_id: number | null;
  owner_user_uuid: string | null;
  owner_name: string | null;
  client_name: string | null;
  happened_at: string;
  source_key: string;
  priority_rank: number;
  suggested_discussion: string;
  deep_link_href: string;
}

export function useAlignmentSignals() {
  return useQuery({
    queryKey: ['alignment-signals-7d'],
    queryFn: async (): Promise<AlignmentSignal[]> => {
      const { data, error } = await supabase
        .from('v_exec_alignment_signals_7d' as any)
        .select('*')
        .order('priority_rank', { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as AlignmentSignal[];
    },
    staleTime: 30_000,
  });
}
