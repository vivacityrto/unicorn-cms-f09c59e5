import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import { toast } from '@/hooks/use-toast';
import type { EosRock, RockWithHierarchy } from '@/types/eos';
import { 
  buildRockHierarchy, 
  groupRocksByLevel, 
  groupTeamRocksByFunction,
  groupIndividualRocksByOwner,
  getCurrentQuarter,
} from '@/utils/rockRollup';
import { uiToDbStatus } from '@/utils/rockStatusUtils';
import { emptyBreakdown, rollupMilestones } from '@/utils/rockMilestoneRollup';

export function useEosRocksHierarchy(options?: { quarterYear?: number; quarterNumber?: number }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const currentQuarter = getCurrentQuarter();
  
  const quarterYear = options?.quarterYear ?? currentQuarter.year;
  const quarterNumber = options?.quarterNumber ?? currentQuarter.quarter;

  // Fetch all rocks with hierarchy data
  const { data: rocksRaw, isLoading, error, refetch } = useQuery({
    queryKey: ['eos-rocks-hierarchy', VIVACITY_TENANT_ID, quarterYear, quarterNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select(`
          *,
          function:accountability_functions(id, name),
          seat:accountability_seats(id, seat_name),
          vto:eos_vto(id, ten_year_target)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as (EosRock & { 
        function: { id: string; name: string } | null;
        seat: { id: string; seat_name: string } | null;
        vto: { id: string; ten_year_target: string | null } | null;
      })[];
    },
    enabled: !!profile,
  });

  const rockIds = useMemo(() => (rocksRaw || []).map((rock) => rock.id), [rocksRaw]);
  const { data: milestoneRows } = useQuery({
    queryKey: ['eos-rock-milestone-progress', VIVACITY_TENANT_ID, quarterYear, quarterNumber, rockIds],
    queryFn: async () => {
      if (rockIds.length === 0) return [];
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, rock_id, status, due_date')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .in('rock_id', rockIds);
      if (error) throw error;
      return data;
    },
    enabled: !!profile && rockIds.length > 0,
  });

  // Build hierarchy and compute rollup statuses
  const rocks = useMemo(() => {
    if (!rocksRaw) return [];
    const hierarchy = buildRockHierarchy(rocksRaw);
    if (!milestoneRows) return hierarchy;
    const breakdowns = rollupMilestones(hierarchy, milestoneRows);
    return hierarchy.map((rock) => {
      const breakdown = breakdowns.get(rock.id) ?? emptyBreakdown();
      return {
        ...rock,
        milestoneStats: { total: breakdown.total, complete: breakdown.complete },
        milestoneBreakdown: breakdown,
      };
    });
  }, [rocksRaw, milestoneRows]);

  // Filter by quarter
  const quarterRocks = useMemo(() => {
    return rocks.filter(r => 
      r.quarter_year === quarterYear && r.quarter_number === quarterNumber
    );
  }, [rocks, quarterYear, quarterNumber]);

  // Group rocks by level
  const { company: companyRocks, team: teamRocks, individual: individualRocks } = useMemo(() => 
    groupRocksByLevel(quarterRocks),
    [quarterRocks]
  );

  // Team rocks by function
  const teamRocksByFunction = useMemo(() => 
    groupTeamRocksByFunction(quarterRocks),
    [quarterRocks]
  );

  // Individual rocks by owner
  const individualRocksByOwner = useMemo(() => 
    groupIndividualRocksByOwner(quarterRocks),
    [quarterRocks]
  );

  // Fetch active VTO for linking company rocks
  const { data: activeVto } = useQuery({
    queryKey: ['active-vto', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('id, ten_year_target')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Fetch accountability functions for team rock selection
  const { data: functions } = useQuery({
    queryKey: ['accountability-functions', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_functions')
        .select('id, name, description')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Update rock mutation
  const updateRock = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosRock> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      toast({ title: 'Rock updated' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error updating rock', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Helper to get children of a rock
  const getChildren = (rockId: string): RockWithHierarchy[] => {
    return rocks.filter(r => r.parent_rock_id === rockId);
  };

  // Helper to get parent chain
  const getParentChain = (rockId: string): RockWithHierarchy[] => {
    const chain: RockWithHierarchy[] = [];
    let current = rocks.find(r => r.id === rockId);
    
    while (current?.parent_rock_id) {
      const parent = rocks.find(r => r.id === current!.parent_rock_id);
      if (parent) {
        chain.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    
    return chain;
  };

  return {
    // All rocks
    rocks,
    quarterRocks,
    
    // By level
    companyRocks,
    teamRocks,
    individualRocks,
    
    // Grouped
    teamRocksByFunction,
    individualRocksByOwner,
    
    // Related data
    activeVto,
    functions,
    
    // Query state
    isLoading,
    error,
    refetch,
    
    // Mutations
    updateRock,

    // Helpers
    getChildren,
    getParentChain,
    
    // Current filter
    currentQuarter: { year: quarterYear, quarter: quarterNumber },
  };
}
