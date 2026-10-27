import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { toast } from '@/hooks/use-toast';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';
import { buildLinkRows, buildMilestoneRows, buildRockPayload } from '@/utils/rockEditor/payload';
import type { RockEditorValues } from '@/utils/rockEditor/types';
import type { Json } from '@/integrations/supabase/types';

export interface SaveRockInput {
  values: RockEditorValues;
  /** Present when editing an existing Rock. */
  id?: string;
  status?: string;
  priority?: number;
  clientTenantId?: number | null;
  rockType?: string;
}

export interface SavedRock {
  id: string;
  parent_rock_id: string | null;
  action: string;
  /** The Rock is saved but its milestones were not, so the form should stay open. */
  milestoneError?: string;
}

const INVALIDATE = [
  ['eos-rocks-hierarchy'],
  ['eos-rocks'],
  ['eos-rock-editor-rocks'],
  ['eos-rock-milestones'],
  ['eos-rock-milestone-progress'],
  ['eos-rock-milestone-links'],
  ['eos-rock-company-milestones'],
];

/**
 * Saves a Rock the same way for every level: the server function validates the
 * hierarchy and records who created it, then milestones and Company links are
 * synchronised. Creating a Rock is never a direct table insert, so none of the
 * server's rules can be skipped.
 */
export function useSaveRock() {
  const queryClient = useQueryClient();

  const { data: activeVto } = useQuery({
    queryKey: ['active-vto', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('id, ten_year_target')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (input: SaveRockInput): Promise<SavedRock> => {
      const { values } = input;
      const payload = buildRockPayload(values, {
        tenantId: VIVACITY_TENANT_ID,
        id: input.id,
        status: input.status,
        priority: input.priority,
        clientTenantId: input.clientTenantId,
        rockType: input.rockType,
      });
      const { data, error } = await supabase.rpc('upsert_rock_with_parenting', { p_payload: payload as Json });
      if (error) throw error;
      const saved = data as unknown as SavedRock;

      try {
        if (values.level === 'company' && activeVto?.id && !input.id) {
          const { error: vtoError } = await supabase.from('eos_rocks').update({ vto_id: activeVto.id }).eq('id', saved.id);
          if (vtoError) throw vtoError;
        }
        await syncMilestones(values, saved.id);
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : 'Unknown error';
        return { ...saved, milestoneError: message };
      }
      return saved;
    },
    onSuccess: (saved, input) => {
      INVALIDATE.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
      if (saved.milestoneError) {
        toast({
          title: input.id ? 'Rock saved, milestones were not' : 'Rock created, milestones were not',
          description: saved.milestoneError,
          variant: 'destructive',
        });
      } else {
        toast({ title: saved.action === 'created' ? 'Rock created' : 'Rock updated' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save the Rock', description: error.message, variant: 'destructive' });
    },
  });

  return mutation;
}

async function syncMilestones(values: RockEditorValues, rockId: string) {
  const rows = buildMilestoneRows(values, rockId, VIVACITY_TENANT_ID);
  const nextIds = rows.map(row => row.id);

  const { data: existing, error: existingError } = await supabase
    .from('eos_rock_milestones')
    .select('id')
    .eq('rock_id', rockId);
  if (existingError) {
    if (isRockMilestoneSchemaUnavailable(existingError)) return;
    throw existingError;
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('eos_rock_milestones').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  const obsoleteIds = (existing || []).map(row => row.id).filter(id => !nextIds.includes(id));
  if (obsoleteIds.length > 0) {
    const { error } = await supabase.from('eos_rock_milestones').delete().in('id', obsoleteIds);
    if (error) throw error;
  }

  if (values.level !== 'individual') return;
  const links = buildLinkRows(values, VIVACITY_TENANT_ID);
  for (const row of rows) {
    const desired = links.filter(link => link.individual_milestone_id === row.id).map(link => link.company_milestone_id);
    const removeStale = supabase.from('eos_rock_milestone_links').delete().eq('individual_milestone_id', row.id);
    const { error } = desired.length > 0
      ? await removeStale.not('company_milestone_id', 'in', `(${desired.join(',')})`)
      : await removeStale;
    if (error) throw error;
  }
  if (links.length > 0) {
    const { error } = await supabase
      .from('eos_rock_milestone_links')
      .upsert(links, { onConflict: 'company_milestone_id,individual_milestone_id', ignoreDuplicates: true });
    if (error) throw error;
  }
}
