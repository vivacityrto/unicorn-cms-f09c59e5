import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StageCounts {
  staffTasks: number;
  clientTasks: number;
  documents: number;
  emails: number;
  loading: boolean;
}

export function useStageCounts(stageInstanceId: number): StageCounts {
  const [counts, setCounts] = useState<Omit<StageCounts, 'loading'>>({
    staffTasks: 0,
    clientTasks: 0,
    documents: 0,
    emails: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stageInstanceId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchCounts = async () => {
      setLoading(true);
      try {
        const [staffRes, clientRes, docRes, emailRes] = await Promise.all([
          supabase
            .from('staff_task_instances')
            .select('id', { count: 'exact', head: true })
            .eq('stageinstance_id', stageInstanceId),
          supabase
            .from('client_task_instances')
            .select('id', { count: 'exact', head: true })
            .eq('stageinstance_id', stageInstanceId),
          supabase
            .from('document_instances')
            .select('id', { count: 'exact', head: true })
            .eq('stageinstance_id', stageInstanceId),
          supabase
            .from('email_instances')
            .select('id', { count: 'exact', head: true })
            .eq('stageinstance_id', stageInstanceId),
        ]);

        if (!cancelled) {
          setCounts({
            staffTasks: staffRes.count ?? 0,
            clientTasks: clientRes.count ?? 0,
            documents: docRes.count ?? 0,
            emails: emailRes.count ?? 0,
          });
        }
      } catch (err) {
        console.error('Error fetching stage counts:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCounts();
    return () => { cancelled = true; };
  }, [stageInstanceId]);

  return { ...counts, loading };
}
