import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';
import { buildDeliveryData, type DeliveryData, type DeliveryLink } from '@/utils/milestoneDelivery';

const CHUNK = 100;

const unique = <T,>(values: readonly T[]) => [...new Set(values)];

function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK));
  return out;
}

async function linksBy(column: 'company_milestone_id' | 'individual_milestone_id', ids: readonly string[]) {
  const rows: DeliveryLink[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase
      .from('eos_rock_milestone_links')
      .select('company_milestone_id, individual_milestone_id')
      .in(column, part);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

const EMPTY: DeliveryData = { milestones: new Map(), rocks: new Map(), links: [] };

/**
 * Both directions of a Rock's milestone links, with everything needed to name
 * and measure them: the links touching this Rock's milestones, every other
 * contributor to the Company milestones involved, those milestones, and their Rocks.
 *
 * Tolerates the milestone tables not existing yet (frontend deployed first).
 */
export function useMilestoneDelivery(options: {
  rockId: string | undefined;
  milestoneIds: readonly string[];
  enabled: boolean;
}) {
  const { rockId, milestoneIds, enabled } = options;

  return useQuery({
    queryKey: ['eos-rock-milestone-delivery', rockId, milestoneIds],
    queryFn: async (): Promise<DeliveryData> => {
      try {
        const own = unique(milestoneIds);
        const [asCompany, asIndividual] = await Promise.all([
          linksBy('company_milestone_id', own),
          linksBy('individual_milestone_id', own),
        ]);
        const touching = [...asCompany, ...asIndividual];

        // Every contributor to each Company milestone involved, not only this Rock's own.
        const companyIds = unique(touching.map(l => l.company_milestone_id));
        const allContributors = await linksBy('company_milestone_id', companyIds);

        const seen = new Set<string>();
        const links = [...touching, ...allContributors].filter(l => {
          const key = `${l.company_milestone_id}|${l.individual_milestone_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const allIds = unique([...own, ...links.flatMap(l => [l.company_milestone_id, l.individual_milestone_id])]);
        const milestones: Parameters<typeof buildDeliveryData>[0]['milestones'][number][] = [];
        for (const part of chunks(allIds)) {
          const { data, error } = await supabase
            .from('eos_rock_milestones')
            .select('id, rock_id, title, status, owner_id, due_date')
            .in('id', part);
          if (error) throw error;
          milestones.push(...(data ?? []));
        }

        const rockIds = unique(milestones.map(m => m.rock_id));
        const rocks: Parameters<typeof buildDeliveryData>[0]['rocks'][number][] = [];
        for (const part of chunks(rockIds)) {
          const { data, error } = await supabase
            .from('eos_rocks')
            .select('id, title, owner_id, rock_level')
            .in('id', part);
          if (error) throw error;
          rocks.push(...(data ?? []));
        }

        return buildDeliveryData({ milestones, rocks, links });
      } catch (error) {
        if (isRockMilestoneSchemaUnavailable(error)) return EMPTY;
        throw error;
      }
    },
    enabled: enabled && !!rockId && milestoneIds.length > 0,
  });
}
