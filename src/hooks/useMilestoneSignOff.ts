import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SIGN_OFF_FROM } from '@/utils/milestoneSignOff';

/** Everything that shows a milestone, its Rock's progress, or its delivery has to refresh. */
const REFRESH = [
  ['eos-rock-milestones'],
  ['eos-rock-milestone-progress'],
  ['eos-rock-milestone-delivery'],
  ['eos-rock-history'],
  ['eos-rock-contribution'],
  ['eos-rock-blockers'],
  ['eos-rocks-hierarchy'],
  ['eos-rocks'],
  ['eos-rock-editor-rocks'],
  ['eos-rock-editor-milestones'],
  ['eos-rock-company-milestones'],
  ['quarterly-rocks'],
];

export class MilestoneChangedError extends Error {
  constructor() {
    super('This milestone changed since you opened it. Close and reopen the Rock to see its current status, then try again.');
    this.name = 'MilestoneChangedError';
  }
}

/**
 * Marks one milestone complete, and touches nothing else on its Rock. The update
 * only applies while the milestone is still in a status it can be signed off from,
 * so a milestone someone else blocked, deferred or already completed in the
 * meantime is left alone. The database's audit trigger records who signed it off.
 */
export function useSignOffMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .update({ status: 'complete' })
        .eq('id', input.id)
        .in('status', [...SIGN_OFF_FROM])
        .select('id');
      if (error) throw error;
      // Row-level security and the status guard both answer "no rows", so zero rows is a refusal, not success.
      if (!data || data.length === 0) throw new MilestoneChangedError();
      return data[0];
    },
    onSuccess: () => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      toast({ title: 'Milestone signed off' });
    },
    onError: error =>
      toast({
        title: 'Could not sign the milestone off',
        description: error instanceof Error ? error.message : 'Something went wrong. Nothing was changed.',
        variant: 'destructive',
      }),
  });
}
