import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type {
  SeatScorecard,
  SeatScorecardVersion,
  SeatMeasurable,
  SeatMeasurableEntry,
  ScorecardWithDetails,
  MeasurableWithEntries,
  CreateMeasurableInput,
  UpdateMeasurableInput,
  CreateEntryInput,
  SaveVersionInput,
  ScorecardStatus,
  getLastNWeeks,
} from '@/types/seatScorecard';

/**
 * Hook to manage a seat's scorecard.
 */
export function useSeatScorecard(seatId?: string) {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;
  const userId = profile?.user_uuid;
  const isSuper = isSuperAdmin();

  // Fetch scorecard with all related data
  const { data: scorecard, isLoading, refetch } = useQuery({
    queryKey: ['seat-scorecard', seatId, tenantId],
    queryFn: async (): Promise<ScorecardWithDetails | null> => {
      if (!tenantId || !seatId) return null;

      // Get scorecard for this seat
      let { data: scorecardData, error } = await supabase
        .from('seat_scorecards')
        .select('*')
        .eq('seat_id', seatId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (!scorecardData) return null;

      // Fetch related data in parallel
      const [measurablesRes, versionsRes, seatRes] = await Promise.all([
        supabase
          .from('seat_measurables')
          .select('*')
          .eq('seat_scorecard_id', scorecardData.id)
          .order('sort_order'),
        supabase
          .from('seat_scorecard_versions')
          .select('*')
          .eq('seat_scorecard_id', scorecardData.id)
          .order('version_number', { ascending: false }),
        supabase
          .from('accountability_seats')
          .select(`
            id, seat_name, function_id
          `)
          .eq('id', seatId)
          .single(),
      ]);

      const measurables = (measurablesRes.data || []) as SeatMeasurable[];
      const versions = (versionsRes.data || []) as SeatScorecardVersion[];
      const seatData = seatRes.data;

      // Fetch entries for all measurables (last 13 weeks)
      const measurableIds = measurables.map(m => m.id);
      let entries: SeatMeasurableEntry[] = [];
      
      if (measurableIds.length > 0) {
        const { data: entriesData } = await supabase
          .from('seat_measurable_entries')
          .select('*')
          .in('seat_measurable_id', measurableIds)
          .order('week_start_date', { ascending: false });
        
        entries = (entriesData || []) as SeatMeasurableEntry[];
      }

      // Build measurables with entries
      const measurablesWithEntries: MeasurableWithEntries[] = measurables.map(m => {
        const mEntries = entries.filter(e => e.seat_measurable_id === m.id);
        const latestEntry = mEntries[0];
        const weeklyTrend = mEntries.slice(0, 13).map(e => e.status);
        
        return {
          ...m,
          entries: mEntries,
          latestEntry,
          weeklyTrend,
        };
      });

      // Get primary owner from seat assignments separately
      let primaryOwner: { user_uuid: string; first_name?: string; last_name?: string; email?: string; } | undefined;
      
      if (seatData) {
        const { data: assignments } = await supabase
          .from('accountability_seat_assignments')
          .select('user_id, assignment_type, end_date')
          .eq('seat_id', seatId)
          .eq('assignment_type', 'Primary')
          .is('end_date', null)
          .limit(1)
          .maybeSingle();
        
        if (assignments?.user_id) {
          const { data: userData } = await supabase
            .from('users')
            .select('user_uuid, first_name, last_name, email')
            .eq('user_uuid', assignments.user_id)
            .single();
          
          primaryOwner = userData || undefined;
        }
      }

      return {
        ...scorecardData,
        measurables: measurablesWithEntries,
        versions,
        seat: seatData ? {
          id: seatData.id,
          seat_name: seatData.seat_name,
          function_id: seatData.function_id,
          primaryOwner,
        } : undefined,
      } as ScorecardWithDetails;
    },
    enabled: !!tenantId && !!seatId,
  });

  // Create scorecard for a seat
  const createScorecard = useMutation({
    mutationFn: async () => {
      if (!tenantId || !userId || !seatId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('seat_scorecards')
        .insert({
          tenant_id: tenantId,
          seat_id: seatId,
          status: 'Draft',
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
      toast({ title: 'Scorecard created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating scorecard', description: error.message, variant: 'destructive' });
    },
  });

  // Add measurable
  const addMeasurable = useMutation({
    mutationFn: async (input: CreateMeasurableInput) => {
      if (!tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('seat_measurables')
        .insert({
          ...input,
          tenant_id: tenantId,
          sort_order: input.sort_order ?? (scorecard?.measurables.length ?? 0),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
      toast({ title: 'Measurable added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding measurable', description: error.message, variant: 'destructive' });
    },
  });

  // Update measurable
  const updateMeasurable = useMutation({
    mutationFn: async (input: UpdateMeasurableInput) => {
      const { id, ...updates } = input;
      
      const { data, error } = await supabase
        .from('seat_measurables')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating measurable', description: error.message, variant: 'destructive' });
    },
  });

  // Delete measurable
  const deleteMeasurable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('seat_measurables')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
      toast({ title: 'Measurable deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting measurable', description: error.message, variant: 'destructive' });
    },
  });

  // Add entry
  const addEntry = useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      if (!tenantId || !userId) throw new Error('Not authenticated');

      // Get the measurable to copy target/comparison
      const measurable = scorecard?.measurables.find(m => m.id === input.seat_measurable_id);
      if (!measurable) throw new Error('Measurable not found');

      const { data, error } = await supabase
        .from('seat_measurable_entries')
        .insert({
          ...input,
          tenant_id: tenantId,
          entered_by: userId,
          comparison_type_stored: measurable.comparison_type,
          target_value_stored: measurable.target_value,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
      toast({ title: 'Entry recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error recording entry', description: error.message, variant: 'destructive' });
    },
  });

  // Update entry
  const updateEntry = useMutation({
    mutationFn: async ({ id, actual_value, notes }: { id: string; actual_value: number; notes?: string }) => {
      const { data, error } = await supabase
        .from('seat_measurable_entries')
        .update({ actual_value, notes })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating entry', description: error.message, variant: 'destructive' });
    },
  });

  // Save version
  const saveVersion = useMutation({
    mutationFn: async (input: SaveVersionInput) => {
      if (!tenantId || !userId) throw new Error('Not authenticated');

      const nextVersion = (scorecard?.versions?.[0]?.version_number ?? 0) + 1;

      const { data, error } = await supabase
        .from('seat_scorecard_versions')
        .insert({
          seat_scorecard_id: input.seat_scorecard_id,
          tenant_id: tenantId,
          version_number: nextVersion,
          change_summary: input.change_summary,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Update current version on scorecard
      await supabase
        .from('seat_scorecards')
        .update({ current_version_id: data.id })
        .eq('id', input.seat_scorecard_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
      toast({ title: 'Version saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving version', description: error.message, variant: 'destructive' });
    },
  });

  // Update status
  const updateStatus = useMutation({
    mutationFn: async ({ scorecardId, status }: { scorecardId: string; status: ScorecardStatus }) => {
      const { data, error } = await supabase
        .from('seat_scorecards')
        .update({ status })
        .eq('id', scorecardId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['seat-scorecard'] });
      toast({ title: `Scorecard ${data.status === 'Active' ? 'activated' : 'status updated'}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    },
  });

  // Check if user can edit scorecard structure
  const canEdit = profile && tenantId && (
    isSuper ||
    profile.unicorn_role === 'Team Leader' ||
    profile.unicorn_role === 'Admin'
  );

  // Check if user can enter data (seat owner or admin)
  const canEnterData = canEdit || (
    scorecard?.seat?.primaryOwner?.user_uuid === userId
  );

  return {
    scorecard,
    isLoading,
    refetch,
    canEdit,
    canEnterData,
    createScorecard,
    addMeasurable,
    updateMeasurable,
    deleteMeasurable,
    addEntry,
    updateEntry,
    saveVersion,
    updateStatus,
  };
}

/**
 * Hook to get all active seat scorecards for a tenant (for L10 integration).
 */
export function useAllSeatScorecards() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ['all-seat-scorecards', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await (supabase as any)
        .from('seat_scorecards')
        .select(`
          *,
          seat:accountability_seats(
            id, seat_name,
            assignments:accountability_seat_assignments(
              user_id, assignment_type, end_date,
              user:users(user_uuid, first_name, last_name)
            )
          ),
          measurables:seat_measurables(
            id, name, target_value, comparison_type, unit, is_active
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'Active');

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });
}
