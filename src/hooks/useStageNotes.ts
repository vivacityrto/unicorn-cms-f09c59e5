import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageNote {
  id: string;
  title: string;
  note_details: string;
  note_type: string;
  created_at: string;
  created_by: string | null;
  priority: string | null;
}

interface UseStageNotesOptions {
  tenantId: number;
  packageId: number;
}

export function useStageNotes({ tenantId, packageId }: UseStageNotesOptions) {
  const [notes, setNotes] = useState<StageNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchNotes();
  }, [tenantId, packageId]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      // Notes are stored at tenant level; filter by package_id if available
      let query = supabase
        .from('notes')
        .select('id, title, note_details, note_type, created_at, created_by, priority')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      // If package_id is set, filter to that package's notes
      // Notes without package_id are tenant-level notes
      const { data, error } = await query;

      if (error) throw error;

      setTotalCount(data?.length || 0);
      const result: StageNote[] = (data || []).slice(0, 10).map(n => ({
        id: n.id,
        title: n.title || 'Untitled Note',
        note_details: n.note_details || '',
        note_type: n.note_type || 'general',
        created_at: n.created_at || '',
        created_by: n.created_by,
        priority: n.priority,
      }));

      setNotes(result);
    } catch (err) {
      console.error('Error fetching stage notes:', err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  return { notes, loading, totalCount, refetch: fetchNotes };
}
