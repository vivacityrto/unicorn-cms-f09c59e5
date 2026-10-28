import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import {
  carryoverLinksFor,
  carryoverPayload,
  type CarryoverForm,
  type CarryoverLink,
} from '@/utils/rockCarryover';

export interface CarryoverRockInfo {
  id: string;
  title: string;
  status: string | null;
  rock_level: string | null;
  quarter_year: number;
  quarter_number: number;
  archived_at: string | null;
}

export interface CarryoverMilestoneInfo {
  id: string;
  rock_id: string;
  title: string;
  status: string;
  due_date: string | null;
}

export interface RockCarryoverData {
  links: CarryoverLink[];
  rocks: Record<string, CarryoverRockInfo>;
  milestones: Record<string, CarryoverMilestoneInfo>;
  /** Source milestones of this Rock that have already been carried. */
  carriedSourceMilestoneIds: string[];
  /** Destination Rocks this Rock has already been carried into. */
  carriedToRockIds: string[];
}

const REFRESH = [
  ['eos-rock-carryover'],
  ['eos-rock-milestones'],
  ['eos-rock-milestone-progress'],
  ['eos-rocks-hierarchy'],
  ['eos-rocks'],
  ['eos-rock-editor-rocks'],
  ['eos-rock-history'],
  ['eos-rock-contribution'],
  ['eos-rock-impact'],
];

/**
 * Where this Rock was carried to and from, with the Rocks and milestones on the
 * other side so each can be named and linked. The same data serves both
 * directions: "carried forward to" on a source and "carried from" on a destination.
 */
export function useRockCarryover(rockId: string | undefined, enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-carryover', rockId],
    queryFn: async (): Promise<RockCarryoverData> => {
      const { data: carryovers, error } = await supabase
        .from('eos_rock_carryovers')
        .select('*')
        .or(`source_rock_id.eq.${rockId},destination_rock_id.eq.${rockId}`);
      if (error) throw error;
      const rows = carryovers ?? [];
      if (rows.length === 0) {
        return { links: [], rocks: {}, milestones: {}, carriedSourceMilestoneIds: [], carriedToRockIds: [] };
      }

      const { data: pairs, error: pairsError } = await supabase
        .from('eos_rock_carryover_milestones')
        .select('*')
        .in('carryover_id', rows.map(r => r.id));
      if (pairsError) throw pairsError;
      const pairRows = pairs ?? [];

      const rockIds = Array.from(new Set(rows.flatMap(r => [r.source_rock_id, r.destination_rock_id]).filter(id => id !== rockId)));
      const milestoneIds = Array.from(
        new Set(pairRows.flatMap(p => [p.source_milestone_id, p.destination_milestone_id]).filter((id): id is string => !!id)),
      );

      const [rocksResult, milestonesResult] = await Promise.all([
        supabase.from('eos_rocks').select('id, title, status, rock_level, quarter_year, quarter_number, archived_at').in('id', rockIds),
        milestoneIds.length > 0
          ? supabase.from('eos_rock_milestones').select('id, rock_id, title, status, due_date').in('id', milestoneIds)
          : Promise.resolve({ data: [] as CarryoverMilestoneInfo[], error: null }),
      ]);
      if (rocksResult.error) throw rocksResult.error;
      if (milestonesResult.error) throw milestonesResult.error;

      return {
        links: carryoverLinksFor(rockId!, rows, pairRows),
        rocks: Object.fromEntries((rocksResult.data ?? []).map(r => [r.id, r as CarryoverRockInfo])),
        milestones: Object.fromEntries((milestonesResult.data ?? []).map(m => [m.id, m as CarryoverMilestoneInfo])),
        carriedSourceMilestoneIds: pairRows
          .filter(p => rows.find(r => r.id === p.carryover_id)?.source_rock_id === rockId)
          .map(p => p.source_milestone_id)
          .filter((id): id is string => !!id),
        carriedToRockIds: rows.filter(r => r.source_rock_id === rockId).map(r => r.destination_rock_id),
      };
    },
    enabled: !!profile && enabled && !!rockId,
  });
}

export function useCarryForwardRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sourceRockId: string; form: CarryoverForm }) => {
      const payload = carryoverPayload(input.form);
      const { data, error } = await supabase.rpc('carry_forward_rock', {
        p_source_rock_id: input.sourceRockId,
        p_destination: payload.destination as unknown as Json,
        p_milestones: payload.milestones as unknown as Json,
        p_reason: payload.reason,
      });
      if (error) throw error;
      return data as { carryover_id: string; destination_rock_id: string; milestones_carried: number };
    },
    onSuccess: () => REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey })),
    onError: error => {
      const description =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Nothing was changed.';
      toast({ title: 'Could not carry this forward', description, variant: 'destructive' });
    },
  });
}
