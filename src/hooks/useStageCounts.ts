import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface StageCounts {
  staffTasks: number;
  clientTasks: number;
  documents: number;
  emails: number;
  /** CTIs already converted to client_action_items — drives the "Publish" vs "Republish" label. */
  publishedCount: number;
}

const EMPTY_COUNTS: StageCounts = { staffTasks: 0, clientTasks: 0, documents: 0, emails: 0, publishedCount: 0 };

/**
 * Staff/client task, document, email, and published-count figures for every
 * stage in a package, fetched in 5 batched queries total rather than 5 per
 * stage row. A package with N stages previously issued 5N requests (e.g. 37
 * stages == 185 requests) just to render count badges and the
 * Publish/Republish button label — this fetches once for the whole set and
 * tallies client-side.
 */
export function useStageCountsBatch(stageInstanceIds: number[]) {
  const idsKey = [...stageInstanceIds].sort((a, b) => a - b).join(',');

  const { data, isLoading } = useQuery({
    queryKey: ['stage-counts-batch', idsKey],
    queryFn: async () => {
      const [staffRes, clientRes, docRes, emailRes, publishedRes] = await Promise.all([
        supabase.from('staff_task_instances').select('stageinstance_id').in('stageinstance_id', stageInstanceIds),
        supabase.from('client_task_instances').select('stageinstance_id').in('stageinstance_id', stageInstanceIds).is('is_archived', false),
        supabase.from('document_instances').select('stageinstance_id').in('stageinstance_id', stageInstanceIds),
        supabase.from('email_instances').select('stageinstance_id').in('stageinstance_id', stageInstanceIds),
        supabase.from('client_task_instances').select('stageinstance_id').in('stageinstance_id', stageInstanceIds).not('published_action_item_id', 'is', null),
      ]);

      const tally = (rows: { stageinstance_id: number }[] | null) => {
        const map = new Map<number, number>();
        (rows || []).forEach((r) => map.set(r.stageinstance_id, (map.get(r.stageinstance_id) || 0) + 1));
        return map;
      };

      const staffMap = tally(staffRes.data);
      const clientMap = tally(clientRes.data);
      const docMap = tally(docRes.data);
      const emailMap = tally(emailRes.data);
      const publishedMap = tally(publishedRes.data);

      const countsByStage: Record<number, StageCounts> = {};
      stageInstanceIds.forEach((id) => {
        countsByStage[id] = {
          staffTasks: staffMap.get(id) || 0,
          clientTasks: clientMap.get(id) || 0,
          documents: docMap.get(id) || 0,
          emails: emailMap.get(id) || 0,
          publishedCount: publishedMap.get(id) || 0,
        };
      });
      return countsByStage;
    },
    enabled: stageInstanceIds.length > 0,
  });

  const getCounts = (stageInstanceId: number): StageCounts => (data && data[stageInstanceId]) || EMPTY_COUNTS;

  return { getCounts, loading: isLoading };
}
