import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface LinkTarget {
  id: string;
  /** The Rock the milestone belongs to: a Team or Company Rock above the milestone being linked. */
  rockId: string;
  title: string;
  status: string;
  dueDate: string | null;
  tenantId: number;
}

/** The milestones of the Rocks above: what a milestone can be mapped to. */
export function useLinkTargets(rockIds: readonly string[], enabled = true) {
  const { profile } = useAuth();
  const key = rockIds.join(',');
  return useQuery({
    queryKey: ['eos-rock-link-targets', key],
    queryFn: async (): Promise<LinkTarget[]> => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, rock_id, title, status, due_date, tenant_id')
        .in('rock_id', [...rockIds])
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(m => ({ id: m.id, rockId: m.rock_id, title: m.title, status: m.status, dueDate: m.due_date, tenantId: m.tenant_id }));
    },
    enabled: !!profile && enabled && rockIds.length > 0,
    // The picker is filled from this, so it must be what the database holds now, never a cached copy.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}

/** Which milestones above (Team or Company) a milestone currently supports. */
export function useLinkedCompanyIds(individualMilestoneId: string | null | undefined, enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-link-ids', individualMilestoneId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('eos_rock_milestone_links')
        .select('company_milestone_id')
        .eq('individual_milestone_id', individualMilestoneId!);
      if (error) throw error;
      return (data ?? []).map(l => l.company_milestone_id);
    },
    enabled: !!profile && enabled && !!individualMilestoneId,
    // The ticks start from this, so a stale copy would make a save delete links nobody unticked.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}

const REFRESH = [
  ['eos-rock-link-ids'],
  ['eos-rock-contribution'],
  ['eos-rock-milestone-delivery'],
  ['eos-rock-editor-links'],
  ['eos-rock-milestones'],
];

/**
 * Change which milestones above a milestone supports. The database checks every link (same tenant;
 * Individual to the Team Rock it serves or the Company Rock above it, Team to the Company Rock it
 * serves), so a bad pairing is refused whatever the screen offers. Additions go in first, then
 * removals, so a failure part-way never leaves a milestone with fewer links than it started with.
 */
export function useSetMilestoneLinks() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { individualMilestoneId: string; tenantId: number; add: string[]; remove: string[] }) => {
      if (input.add.length > 0) {
        const { error } = await supabase.from('eos_rock_milestone_links').insert(
          input.add.map(companyId => ({
            tenant_id: input.tenantId,
            company_milestone_id: companyId,
            individual_milestone_id: input.individualMilestoneId,
            created_by: profile?.user_uuid ?? null,
          })),
        );
        if (error) throw error;
      }
      if (input.remove.length > 0) {
        const { error } = await supabase
          .from('eos_rock_milestone_links')
          .delete()
          .eq('individual_milestone_id', input.individualMilestoneId)
          .in('company_milestone_id', input.remove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      toast({ title: 'Mapping updated' });
    },
    onError: error => {
      REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      const description = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Nothing was changed.';
      toast({ title: 'Could not update the mapping', description, variant: 'destructive' });
    },
  });
}
