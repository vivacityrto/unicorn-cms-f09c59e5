import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';
import type { Phase, PhaseStage } from '@/types/checkpoint-phase';

/**
 * Hook to manage phases assigned to a package in the Package Builder.
 * Handles CRUD for phase definitions and phase-stage mappings.
 */
export function usePackagePhases(packageId: number | null) {
  const queryClient = useQueryClient();

  // Fetch all phase definitions (non-archived)
  const { data: allPhases = [], isLoading: loadingPhases } = useQuery({
    queryKey: ['phases'],
    queryFn: async (): Promise<Phase[]> => {
      const { data, error } = await (supabase as any)
        .from('phases')
        .select('*')
        .eq('is_archived', false)
        .order('sort_order_default');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: QUERY_STALE_TIMES.LIST,
  });

  // Fetch phase_stages for this package
  const { data: phaseStages = [], isLoading: loadingPhaseStages } = useQuery({
    queryKey: ['phase-stages', packageId],
    queryFn: async (): Promise<PhaseStage[]> => {
      if (!packageId) return [];
      const { data, error } = await (supabase as any)
        .from('phase_stages')
        .select('*')
        .eq('package_id', packageId)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!packageId,
    staleTime: QUERY_STALE_TIMES.LIST,
  });

  // Create a new phase definition
  const createPhase = useMutation({
    mutationFn: async (phase: { phase_key: string; title: string; description?: string; gate_type: string; allow_parallel?: boolean }) => {
      const { data, error } = await (supabase as any)
        .from('phases')
        .insert(phase)
        .select()
        .single();
      if (error) throw error;
      return data as Phase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
    },
  });

  // Update a phase definition
  const updatePhase = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Phase> & { id: string }) => {
      const { error } = await (supabase as any)
        .from('phases')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
    },
  });

  // Assign a stage to a phase for this package
  const assignStageToPhase = useMutation({
    mutationFn: async ({ phaseId, stageId, sortOrder = 0, isRequired = true }: { phaseId: string; stageId: number; sortOrder?: number; isRequired?: boolean }) => {
      if (!packageId) throw new Error('No package selected');
      const { error } = await (supabase as any)
        .from('phase_stages')
        .insert({
          phase_id: phaseId,
          package_id: packageId,
          stage_id: stageId,
          sort_order: sortOrder,
          is_required: isRequired,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-stages', packageId] });
    },
  });

  // Remove a stage from a phase
  const removeStageFromPhase = useMutation({
    mutationFn: async (phaseStageId: string) => {
      const { error } = await (supabase as any)
        .from('phase_stages')
        .delete()
        .eq('id', phaseStageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-stages', packageId] });
    },
  });

  // Get phases that have stages assigned for this package
  const assignedPhaseIds = [...new Set(phaseStages.map(ps => ps.phase_id))];
  const assignedPhases = allPhases.filter(p => assignedPhaseIds.includes(p.id));

  // Get stages grouped by phase
  const getStagesForPhase = (phaseId: string) =>
    phaseStages.filter(ps => ps.phase_id === phaseId).sort((a, b) => a.sort_order - b.sort_order);

  return {
    allPhases,
    assignedPhases,
    phaseStages,
    loading: loadingPhases || loadingPhaseStages,
    createPhase,
    updatePhase,
    assignStageToPhase,
    removeStageFromPhase,
    getStagesForPhase,
  };
}
