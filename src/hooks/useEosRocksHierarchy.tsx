import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import { toast } from '@/hooks/use-toast';
import type { EosRock, RockWithHierarchy, RockLevel } from '@/types/eos';
import type { Json, TablesInsert } from '@/integrations/supabase/types';
import { 
  buildRockHierarchy, 
  groupRocksByLevel, 
  groupTeamRocksByFunction,
  groupIndividualRocksByOwner,
  getCurrentQuarter,
  canRockLevelBeParent,
} from '@/utils/rockRollup';
import { DB_ROCK_STATUS, uiToDbStatus } from '@/utils/rockStatusUtils';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';

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
  client_tenant_id?: number | null;
}

const toMilestoneUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();

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
        .select('id, rock_id, status')
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
    const progressByRock = new Map<string, { total: number; complete: number }>();
    const rockIdsWithMilestones = new Set<string>();
    for (const milestone of milestoneRows || []) {
      rockIdsWithMilestones.add(milestone.rock_id);
      if (milestone.status === 'deferred') continue;
      const current = progressByRock.get(milestone.rock_id) || { total: 0, complete: 0 };
      current.total += 1;
      if (milestone.status === 'complete') current.complete += 1;
      progressByRock.set(milestone.rock_id, current);
    }
    const childrenByParent = new Map<string, typeof hierarchy>();
    for (const rock of hierarchy) {
      if (!rock.parent_rock_id) continue;
      const children = childrenByParent.get(rock.parent_rock_id) || [];
      children.push(rock);
      childrenByParent.set(rock.parent_rock_id, children);
    }
    const descendantIndividuals = (rockId: string): string[] => {
      const children = childrenByParent.get(rockId) || [];
      return children.flatMap(child =>
        child.rock_level === 'individual' ? [child.id] : descendantIndividuals(child.id)
      );
    };
    return hierarchy.map((rock) => {
      if (rock.rock_level === 'individual') {
        return { ...rock, milestoneStats: progressByRock.get(rock.id) || { total: 0, complete: 0 } };
      }
      const leafIds = descendantIndividuals(rock.id);
      const hasLeafMilestones = leafIds.some(childId => rockIdsWithMilestones.has(childId));
      const leafStats = leafIds.reduce(
        (total, childId) => {
          const childStats = progressByRock.get(childId);
          return {
            total: total.total + (childStats?.total || 0),
            complete: total.complete + (childStats?.complete || 0),
          };
        },
        { total: 0, complete: 0 }
      );
      return {
        ...rock,
        milestoneStats: hasLeafMilestones
          ? leafStats
          : progressByRock.get(rock.id) || { total: 0, complete: 0 },
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

  // Create rock mutation
  const createRock = useMutation({
    mutationFn: async (input: CreateRockInput) => {
      if (input.parent_rock_id) {
        const parent = rocks.find(rock => rock.id === input.parent_rock_id);
        if (!parent || !canRockLevelBeParent(parent.rock_level, input.rock_level)) {
          throw new Error('Select a parent Rock that supports this Rock level.');
        }
        if (parent.quarter_year !== (input.quarter_year || quarterYear) ||
            parent.quarter_number !== (input.quarter_number || quarterNumber)) {
          throw new Error('Parent and child Rocks must be in the same quarter.');
        }
      }

      const rockData: TablesInsert<'eos_rocks'> = {
        ...input,
        milestones: input.milestones as unknown as Json,
        tenant_id: VIVACITY_TENANT_ID,
        status: input.status || DB_ROCK_STATUS.ON_TRACK,
        quarter_year: input.quarter_year || quarterYear,
        quarter_number: input.quarter_number || quarterNumber,
        // Auto-link to VTO for company rocks
        vto_id: input.rock_level === 'company' ? (input.vto_id || activeVto?.id) : null,
      };

      let savedRockId: string;
      if (input.rock_level === 'individual') {
        const { data, error } = await supabase.rpc('upsert_rock_with_parenting', {
          p_payload: rockData as unknown as Json,
        });
        if (error) throw error;
        const result = data as { id: string; parent_rock_id: string | null; action: string };
        savedRockId = result.id;
      } else {
        const { data, error } = await supabase
          .from('eos_rocks')
          .insert(rockData)
          .select()
          .single();

        if (error) throw error;
        savedRockId = data.id;
      }

      const legacyMilestones = input.milestones || [];
      if (legacyMilestones.length > 0) {
        const milestoneRows = legacyMilestones.map((milestone, index) => {
          const milestoneId = toMilestoneUuid(milestone.id);
          return {
            id: milestoneId,
            tenant_id: VIVACITY_TENANT_ID,
            rock_id: savedRockId,
            legacy_source_id: milestoneId,
            legacy_snapshot: milestone as unknown as Json,
            title: milestone.text.trim() || '(untitled milestone)',
            owner_id: input.owner_id || null,
            due_date: input.due_date || null,
            priority: 'medium',
            status: milestone.completed ? 'complete' : 'not_started',
            sort_order: index,
          };
        });
        const { error } = await supabase.from('eos_rock_milestones').upsert(milestoneRows, { onConflict: 'id' });
        if (error && !isRockMilestoneSchemaUnavailable(error)) {
          throw new Error(`Rock was created, but its milestones could not be synchronized: ${error.message}`);
        }
      }

      return { id: savedRockId, rock_level: input.rock_level };
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

  // Delete rock mutation (hard delete) - refuses to delete a rock with
  // children, matching eos.scorecard.manage's deleteMetric guard against
  // orphaning cascaded data; archive is the path for a rock still linked
  // to child rocks.
  const deleteRock = useMutation({
    mutationFn: async (id: string) => {
      const hasChildren = rocks.some(r => r.parent_rock_id === id);
      if (hasChildren) {
        throw new Error('This rock has child rocks cascading from it. Archive it instead of deleting.');
      }

      const { error } = await supabase
        .from('eos_rocks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      toast({ title: 'Rock deleted' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting rock',
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
    deleteRock,

    // Helpers
    getChildren,
    getParentChain,
    
    // Current filter
    currentQuarter: { year: quarterYear, quarter: quarterNumber },
  };
}
