import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import { blockerPayload, type BlockerForm, type BlockerRow, type BlockerSubject } from '@/utils/rockBlocker';

/** Everything that shows a Rock or its status has to refresh when a blocker changes. */
const REFRESH = [
  ['eos-rock-blockers'],
  ['eos-rock-milestones'],
  ['eos-rock-milestone-progress'],
  ['eos-rocks-hierarchy'],
  ['eos-rocks'],
  ['eos-rock-editor-rocks'],
  ['eos-rock-history'],
  ['eos-rock-contribution'],
  ['eos-rock-milestone-delivery'],
];

/**
 * Blockers for a Rock and its milestones, open and resolved. Reading follows the
 * same tenant rules as the Rock itself; writing is only through set_blocker() and
 * resolve_blocker().
 */
export function useRockBlockers(rockId: string | undefined, milestoneIds: string[], enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-blockers', rockId, milestoneIds],
    queryFn: async (): Promise<BlockerRow[]> => {
      const filters = [`rock_id.eq.${rockId}`];
      if (milestoneIds.length > 0) filters.push(`milestone_id.in.(${milestoneIds.join(',')})`);
      const { data, error } = await supabase
        .from('eos_rock_blockers')
        .select('*')
        .or(filters.join(','))
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile && enabled && !!rockId,
  });
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Something went wrong. Nothing was changed.';
}

export function useSetBlocker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { subject: BlockerSubject; id: string; form: BlockerForm }) => {
      const { data, error } = await supabase.rpc('set_blocker', {
        p_subject: input.subject,
        p_id: input.id,
        p_blocker: blockerPayload(input.form) as unknown as Json,
      });
      if (error) throw error;
      return data as { blocker_id: string; created: boolean };
    },
    onSuccess: result => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      toast({ title: result.created ? 'Marked as blocked' : 'Blocker updated' });
    },
    onError: error => toast({ title: 'Could not save the blocker', description: messageOf(error), variant: 'destructive' }),
  });
}

export function useResolveBlocker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { subject: BlockerSubject; id: string; status: string; note: string }) => {
      const { data, error } = await supabase.rpc('resolve_blocker', {
        p_subject: input.subject,
        p_id: input.id,
        p_new_status: input.status,
        p_note: input.note.trim() || undefined,
      });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: () => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      toast({ title: 'Blocker resolved', description: 'The work is not marked complete. Update its status when it is done.' });
    },
    onError: error => toast({ title: 'Could not resolve the blocker', description: messageOf(error), variant: 'destructive' }),
  });
}
