import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  buildContribution,
  type ContributionBlocker,
  type ContributionCarry,
  type ContributionMilestone,
  type ContributionModel,
  type ContributionRock,
} from '@/utils/rockContribution';

const ROCK_COLUMNS = 'id, title, status, owner_id, due_date, quarter_year, quarter_number, rock_level, parent_rock_id';
const MILESTONE_COLUMNS = 'id, rock_id, title, status, owner_id, due_date';

/**
 * The Individual Rocks under a Company Rock, with their milestones, how each
 * maps to the Company Rock's milestones, any open blockers, and any carryover.
 * Loaded only when asked (the section expanded), so a card costs nothing until
 * someone opens it. Everything comes from parent_rock_id and the stored
 * milestone links.
 */
export function useRockContribution(companyRockId: string | undefined, enabled: boolean) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-contribution', companyRockId],
    queryFn: async (): Promise<ContributionModel> => {
      const { data: company, error: companyError } = await supabase
        .from('eos_rocks')
        .select(ROCK_COLUMNS)
        .eq('id', companyRockId!)
        .single();
      if (companyError) throw companyError;

      const { data: children, error: childrenError } = await supabase
        .from('eos_rocks')
        .select(ROCK_COLUMNS)
        .eq('parent_rock_id', companyRockId!)
        .is('archived_at', null);
      if (childrenError) throw childrenError;
      const direct = (children ?? []) as ContributionRock[];
      // An Individual Rock can serve the Company Rock through a Team Rock (a client's Team Rock, say).
      // The database counts those as serving the Company Rock for milestone links, so they belong here too.
      const teamIds = direct.filter(r => r.rock_level === 'team').map(r => r.id);
      let throughTeams: ContributionRock[] = [];
      if (teamIds.length > 0) {
        const { data: grand, error: grandError } = await supabase
          .from('eos_rocks')
          .select(ROCK_COLUMNS)
          .in('parent_rock_id', teamIds)
          .is('archived_at', null);
        if (grandError) throw grandError;
        throughTeams = (grand ?? []) as ContributionRock[];
      }
      const childRocks = [...direct, ...throughTeams];
      const rockIds = [companyRockId!, ...childRocks.map(r => r.id)];

      const { data: milestoneRows, error: milestonesError } = await supabase
        .from('eos_rock_milestones')
        .select(MILESTONE_COLUMNS)
        .in('rock_id', rockIds)
        .order('sort_order', { ascending: true });
      if (milestonesError) throw milestonesError;
      const allMilestones = (milestoneRows ?? []) as ContributionMilestone[];
      const companyMilestones = allMilestones.filter(m => m.rock_id === companyRockId);
      const childMilestones = allMilestones.filter(m => m.rock_id !== companyRockId);

      const [linksResult, blockersResult, carryoversResult] = await Promise.all([
        companyMilestones.length > 0
          ? supabase
              .from('eos_rock_milestone_links')
              .select('company_milestone_id, individual_milestone_id')
              .in('company_milestone_id', companyMilestones.map(m => m.id))
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('eos_rock_blockers')
          .select('id, rock_id, milestone_id, reason, review_date')
          .is('resolved_at', null)
          .or(
            [
              `rock_id.in.(${childRocks.map(r => r.id).join(',') || '00000000-0000-0000-0000-000000000000'})`,
              `milestone_id.in.(${childMilestones.map(m => m.id).join(',') || '00000000-0000-0000-0000-000000000000'})`,
            ].join(','),
          ),
        supabase.from('eos_rock_carryovers').select('*').in('source_rock_id', rockIds),
      ]);
      if (linksResult.error) throw linksResult.error;
      if (blockersResult.error) throw blockersResult.error;
      if (carryoversResult.error) throw carryoversResult.error;

      const carryoverRows = carryoversResult.data ?? [];
      let pairs: ContributionCarry['milestones'] = [];
      let destinationRocks: ContributionRock[] = [];
      let destinationMilestones: ContributionMilestone[] = [];
      if (carryoverRows.length > 0) {
        const pairsResult = await supabase
          .from('eos_rock_carryover_milestones')
          .select('*')
          .in('carryover_id', carryoverRows.map(c => c.id));
        if (pairsResult.error) throw pairsResult.error;
        pairs = pairsResult.data ?? [];

        const [destRocks, destMilestones] = await Promise.all([
          supabase.from('eos_rocks').select(ROCK_COLUMNS).in('id', carryoverRows.map(c => c.destination_rock_id)),
          pairs.some(p => p.destination_milestone_id)
            ? supabase
                .from('eos_rock_milestones')
                .select(MILESTONE_COLUMNS)
                .in('id', pairs.map(p => p.destination_milestone_id).filter((id): id is string => !!id))
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (destRocks.error) throw destRocks.error;
        if (destMilestones.error) throw destMilestones.error;
        destinationRocks = (destRocks.data ?? []) as ContributionRock[];
        destinationMilestones = (destMilestones.data ?? []) as ContributionMilestone[];
      }

      return buildContribution({
        companyRock: company as ContributionRock,
        companyMilestones,
        childRocks,
        childMilestones,
        links: linksResult.data ?? [],
        blockers: (blockersResult.data ?? []) as ContributionBlocker[],
        carryovers: carryoverRows.map(carryover => ({
          carryover,
          milestones: pairs.filter(p => p.carryover_id === carryover.id),
        })),
        destinationRocks,
        destinationMilestones,
      });
    },
    enabled: !!profile && enabled && !!companyRockId,
  });
}
