import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import { toast } from '@/hooks/use-toast';
import type { EosRock, RockWithHierarchy, RockLevel } from '@/types/eos';
import { 
  buildRockHierarchy, 
  groupRocksByLevel, 
  groupTeamRocksByFunction,
  groupIndividualRocksByOwner,
  getCurrentQuarter,
} from '@/utils/rockRollup';
import { DB_ROCK_STATUS, uiToDbStatus } from '@/utils/rockStatusUtils';

export interface CreateRockInput {
  title: string;
  description?: string;
  issue?: string;
  outcome?: string;
  milestones?: { id: string; text: string; completed: boolean }[];
  rock_level: RockLevel;
  parent_rock_id?: string | null;
  function_id?: string | null;
  vto_id?: string | null;
  seat_id?: string | null;
  owner_id?: string | null;
  status?: string;
  quarter_year?: number;
  quarter_number?: number;
  due_date: string;
  client_id?: string | null;
}

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

  // Build hierarchy and compute rollup statuses
  const rocks = useMemo(() => {
    if (!rocksRaw) return [];
    return buildRockHierarchy(rocksRaw);
  }, [rocksRaw]);

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

  // Create rock mutation
  const createRock = useMutation({
    mutationFn: async (input: CreateRockInput) => {
      const rockData = {
        ...input,
        tenant_id: VIVACITY_TENANT_ID,
        status: input.status || DB_ROCK_STATUS.ON_TRACK,
        quarter_year: input.quarter_year || quarterYear,
        quarter_number: input.quarter_number || quarterNumber,
        // Auto-link to VTO for company rocks
        vto_id: input.rock_level === 'company' ? (input.vto_id || activeVto?.id) : null,
      };

      const { data, error } = await supabase
        .from('eos_rocks')
        .insert(rockData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      toast({ 
        title: `${data.rock_level?.charAt(0).toUpperCase()}${data.rock_level?.slice(1) || 'Rock'} Rock created` 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error creating rock', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Update rock mutation
  const updateRock = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosRock> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .update(updates as any)
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

  // Archive rock mutation (soft delete)
  const archiveRock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_rocks')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      toast({ title: 'Rock archived' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error archiving rock', 
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
    createRock,
    updateRock,
    archiveRock,
    
    // Helpers
    getChildren,
    getParentChain,
    
    // Current filter
    currentQuarter: { year: quarterYear, quarter: quarterNumber },
  };
}
