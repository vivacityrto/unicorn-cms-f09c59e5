import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { toast } from '@/hooks/use-toast';
import type { RockEvent, RockImpact } from '@/utils/rockLifecycle';

const REFRESH = [
  ['eos-rocks-hierarchy'],
  ['eos-rocks'],
  ['eos-rock-editor-rocks'],
  ['eos-rocks-archived'],
  ['eos-rock-history'],
  ['eos-rock-impact'],
];

export interface ArchivedRock {
  id: string;
  title: string;
  level: string;
  quarterYear: number | null;
  quarterNumber: number | null;
  ownerId: string | null;
  archivedAt: string;
  archivedBy: string | null;
}

/** What archiving or deleting this Rock would touch. Fetched fresh each time it is asked for. */
export function useRockImpact(rockId: string | null) {
  return useQuery({
    queryKey: ['eos-rock-impact', rockId],
    queryFn: async (): Promise<RockImpact> => {
      const { data, error } = await supabase.rpc('rock_impact', { p_rock_id: rockId as string });
      if (error) throw error;
      return data as unknown as RockImpact;
    },
    enabled: !!rockId,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useArchivedRocks(enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rocks-archived', VIVACITY_TENANT_ID],
    queryFn: async (): Promise<ArchivedRock[]> => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, rock_level, quarter_year, quarter_number, owner_id, archived_at')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const byRock = new Map<string, string | null>();
      if (rows.length > 0) {
        const { data: events, error: eventsError } = await supabase
          .from('eos_rock_events')
          .select('rock_id, actor_user_id, occurred_at')
          .in('rock_id', rows.map(r => r.id))
          .eq('action', 'archived')
          .order('occurred_at', { ascending: false });
        // History is a nicety here: without it the list still works.
        if (!eventsError) for (const e of events || []) if (!byRock.has(e.rock_id)) byRock.set(e.rock_id, e.actor_user_id);
      }
      return rows.map(r => ({
        id: r.id,
        title: r.title,
        level: r.rock_level || 'company',
        quarterYear: r.quarter_year,
        quarterNumber: r.quarter_number,
        ownerId: r.owner_id,
        archivedAt: r.archived_at as string,
        archivedBy: byRock.get(r.id) ?? null,
      }));
    },
    enabled: !!profile && enabled,
  });
}

/** The newest changes to one Rock. */
export function useRockHistory(rockId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['eos-rock-history', rockId],
    queryFn: async (): Promise<RockEvent[]> => {
      const { data, error } = await supabase
        .from('eos_rock_events')
        .select('id, action, actor_user_id, before_data, after_data, occurred_at')
        .eq('rock_id', rockId as string)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown as RockEvent[]).slice(0, 12);
    },
    enabled: !!rockId && enabled,
  });
}

export function useArchiveRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; includeChildren: boolean }) => {
      const { data, error } = await supabase.rpc('archive_rock', { p_rock_id: input.id, p_include_children: input.includeChildren });
      if (error) throw error;
      return data as unknown as { archived: string[] };
    },
    onSuccess: result => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      const n = result.archived.length;
      toast({ title: n > 1 ? `${n} Rocks archived` : 'Rock archived', description: 'Restore from the Archived tab.' });
    },
    onError: (error: Error) => toast({ title: 'Could not archive the Rock', description: error.message, variant: 'destructive' }),
  });
}

export function useRestoreRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; includeParents: boolean; includeChildren: boolean }) => {
      const { data, error } = await supabase.rpc('restore_rock', {
        p_rock_id: input.id,
        p_include_parents: input.includeParents,
        p_include_children: input.includeChildren,
      });
      if (error) throw error;
      return data as unknown as { restored: string[] };
    },
    onSuccess: result => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      const n = result.restored.length;
      toast({ title: n > 1 ? `${n} Rocks restored` : 'Rock restored' });
    },
    onError: (error: Error) => toast({ title: 'Could not restore the Rock', description: error.message, variant: 'destructive' }),
  });
}

/** Permanent. The database refuses a Rock with children, linked issues or progress, whatever the screen says. */
export function useDeleteRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('eos_rocks').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('The Rock was not deleted. It may already be gone, or you may not have permission.');
    },
    onSuccess: () => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      toast({ title: 'Rock deleted' });
    },
    onError: (error: Error) => toast({ title: 'Could not delete the Rock', description: error.message, variant: 'destructive' }),
  });
}
