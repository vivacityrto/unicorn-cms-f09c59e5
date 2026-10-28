import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface LinkTarget {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  tenantId: number;
}

/** The Company Rock's milestones: what an Individual milestone can be mapped to. */
export function useLinkTargets(companyRockId: string | null | undefined, enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-link-targets', companyRockId],
    queryFn: async (): Promise<LinkTarget[]> => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, title, status, due_date, tenant_id')
        .eq('rock_id', companyRockId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(m => ({ id: m.id, title: m.title, status: m.status, dueDate: m.due_date, tenantId: m.tenant_id }));
    },
    enabled: !!profile && enabled && !!companyRockId,
    // The picker is filled from this, so it must be what the database holds now, never a cached copy.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}

/** Which Company milestones an Individual milestone currently supports. */
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
 * Change which Company milestones an Individual milestone supports. The database checks every
 * link (same tenant, a Company Rock's milestone, an Individual Rock serving it directly or through a
 * Team Rock), so a bad pairing is refused whatever the screen offers. Additions go in first, then
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
