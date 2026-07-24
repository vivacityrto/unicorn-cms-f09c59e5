import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import type {
  EosConfiguration,
  EosConfigurationSegment,
  ConfigMeetingType,
  EosConfigSegmentType,
} from '@/types/eos';

export interface SeatOption {
  id: string;
  seat_name: string;
  holder_name: string | null;
}

export const useEosConfigurations = () => {
  const queryClient = useQueryClient();

  const { data: configurations, isLoading } = useQuery({
    queryKey: ['eos-configurations', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eos_configurations')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('meeting_type');

      if (error) throw error;
      return data as EosConfiguration[];
    },
  });

  const getConfigForType = (meetingType: ConfigMeetingType) => {
    return configurations?.find((c) => c.meeting_type === meetingType);
  };

  const updateConfiguration = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosConfiguration> & { id: number }) => {
      const { data, error } = await (supabase as any)
        .from('eos_configurations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-configurations'] });
      toast({ title: 'Configuration updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating configuration', description: error.message, variant: 'destructive' });
    },
  });

  return {
    configurations,
    isLoading,
    getConfigForType,
    updateConfiguration,
  };
};

export const useEosConfigurationSegments = (configurationId?: number) => {
  const queryClient = useQueryClient();

  const { data: segments, isLoading } = useQuery({
    queryKey: ['eos-configuration-segments', configurationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eos_configuration_segments')
        .select('*')
        .eq('configuration_id', configurationId)
        .order('sequence_order');

      if (error) throw error;
      return data as EosConfigurationSegment[];
    },
    enabled: !!configurationId,
  });

  const updateSegment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosConfigurationSegment> & { id: number }) => {
      const { data, error } = await (supabase as any)
        .from('eos_configuration_segments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-configuration-segments', configurationId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating segment', description: error.message, variant: 'destructive' });
    },
  });

  const addSegment = useMutation({
    mutationFn: async (segment: {
      label: string;
      segment_type: EosConfigSegmentType;
      duration_minutes: number;
    }) => {
      if (!configurationId) throw new Error('No configuration selected');
      // Use max(sequence_order) + 1, not segments.length + 1 - deletes leave
      // gaps, so length-based numbering can reuse an order still held by a
      // surviving segment and hit the UNIQUE(configuration_id, sequence_order)
      // constraint.
      const nextOrder = (segments?.length
        ? Math.max(...segments.map((s) => s.sequence_order))
        : 0) + 1;
      const { data, error } = await (supabase as any)
        .from('eos_configuration_segments')
        .insert({
          configuration_id: configurationId,
          sequence_order: nextOrder,
          label: segment.label,
          segment_type: segment.segment_type,
          duration_minutes: segment.duration_minutes,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-configuration-segments', configurationId] });
      toast({ title: 'Segment added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding segment', description: error.message, variant: 'destructive' });
    },
  });

  const removeSegment = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await (supabase as any)
        .from('eos_configuration_segments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-configuration-segments', configurationId] });
      toast({ title: 'Segment removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error removing segment', description: error.message, variant: 'destructive' });
    },
  });

  const reorderSegments = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      // Two-phase renumber avoids colliding with the UNIQUE(configuration_id,
      // sequence_order) constraint mid-update - it's DEFERRABLE INITIALLY
      // DEFERRED specifically so this can run inside one transaction, but the
      // supabase-js client issues one request per call, so we push every
      // segment past the current max first, then assign final positions.
      // Offset is derived from the current max sequence_order (not
      // segments.length + 1000) so a retry after a failed mid-reorder -
      // which can strand rows already in the 1000+ range - always lands
      // above whatever's actually there instead of reusing the same
      // fixed offset and risking a collision with those stranded rows.
      const currentMax = segments?.length
        ? Math.max(...segments.map((s) => s.sequence_order))
        : 0;
      const offset = currentMax + 1000;
      const phase1 = await Promise.all(
        orderedIds.map((id, index) =>
          (supabase as any)
            .from('eos_configuration_segments')
            .update({ sequence_order: offset + index })
            .eq('id', id),
        ),
      );
      const phase1Error = phase1.find((r) => r.error)?.error;
      if (phase1Error) throw phase1Error;

      const phase2 = await Promise.all(
        orderedIds.map((id, index) =>
          (supabase as any)
            .from('eos_configuration_segments')
            .update({ sequence_order: index + 1 })
            .eq('id', id),
        ),
      );
      const phase2Error = phase2.find((r) => r.error)?.error;
      if (phase2Error) throw phase2Error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-configuration-segments', configurationId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error reordering segments', description: error.message, variant: 'destructive' });
    },
  });

  return {
    segments,
    isLoading,
    updateSegment,
    addSegment,
    removeSegment,
    reorderSegments,
  };
};

/**
 * Accountability seats for tenant 6372 with their current Primary
 * assignment's holder name, for the facilitator/visionary/integrator
 * seat pickers.
 */
export const useEosSeatOptions = () => {
  const { data: seats, isLoading } = useQuery({
    queryKey: ['eos-seat-options', VIVACITY_TENANT_ID],
    queryFn: async (): Promise<SeatOption[]> => {
      const { data: seatRows, error: seatError } = await (supabase as any)
        .from('accountability_seats')
        .select('id, seat_name')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('seat_name');
      if (seatError) throw seatError;

      const { data: assignmentRows, error: assignmentError } = await (supabase as any)
        .from('accountability_seat_assignments')
        .select('seat_id, user_id')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('assignment_type', 'Primary')
        .is('end_date', null);
      if (assignmentError) throw assignmentError;

      const userIds = (assignmentRows ?? []).map((a: any) => a.user_id);
      const { data: userRows, error: userError } = userIds.length
        ? await (supabase as any)
            .from('users')
            .select('user_uuid, first_name, last_name')
            .in('user_uuid', userIds)
        : { data: [], error: null };
      if (userError) throw userError;

      const userMap = new Map((userRows ?? []).map((u: any) => [u.user_uuid, u]));
      const holderBySeat = new Map(
        (assignmentRows ?? []).map((a: any) => {
          const user = userMap.get(a.user_id) as { first_name?: string; last_name?: string } | undefined;
          const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : null;
          return [a.seat_id, name];
        }),
      );

      return (seatRows ?? []).map((s: any) => ({
        id: s.id,
        seat_name: s.seat_name,
        holder_name: (holderBySeat.get(s.id) as string | null) ?? null,
      }));
    },
  });

  return { seats, isLoading };
};
